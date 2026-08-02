// Supabase Edge Function: continuous route optimization.
// Runs on a schedule (every ~20 min). For each worker-day that has bookings
// needing routing, and is NOT inside the 12-hour lock, it asks Google for the
// optimal driving order and saves it to the `routes` table.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GKEY = Deno.env.get("GOOGLE_MAPS_KEY")!;
const LOCK_HOURS = 12;
// Crunch mode: every-run optimization begins 3 weeks before Pesach 2027 (~Apr 21).
const CRUNCH_START = new Date("2027-03-31T00:00:00Z");

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

Deno.serve(async () => {
  const now = new Date();

  // Cadence control: in crunch season, run every time (every ~20 min via schedule).
  // Off-season, only do a full pass once per calendar day (skip if already ran today).
  const inCrunch = now >= CRUNCH_START;
  if (!inCrunch) {
    const today = now.toISOString().slice(0, 10);
    const { data: ranToday } = await sb
      .from("routes").select("optimized_at").gte("optimized_at", `${today}T00:00:00Z`).limit(1);
    if (ranToday && ranToday.length > 0) {
      return json({ skipped: "already optimized today (off-season once-a-day)", now: now.toISOString() });
    }
  }
  // pull all assigned, geocoded, future bookings
  const { data: bookings, error } = await sb
    .from("bookings")
    .select("id,assigned_worker_id,service_date,time_slot,lat,lng,routed_at,created_at")
    .not("assigned_worker_id", "is", null)
    .not("lat", "is", null)
    .not("service_date", "is", null);
  if (error) return json({ error: error.message }, 500);

  // group by worker+date
  const groups: Record<string, any[]> = {};
  for (const b of bookings ?? []) {
    const key = `${b.assigned_worker_id}__${b.service_date}`;
    (groups[key] ||= []).push(b);
  }

  const results: any[] = [];
  for (const [key, jobs] of Object.entries(groups)) {
    const [workerId, date] = key.split("__");
    // 12-hour lock: is the service date within 12h from now?
    const serviceStart = new Date(`${date}T00:00:00`);
    const hoursUntil = (serviceStart.getTime() - now.getTime()) / 36e5;
    const locked = hoursUntil <= LOCK_HOURS;

    // skip if locked AND already routed (don't disturb a locked day)
    const anyNew = jobs.some((j) => !j.routed_at || new Date(j.routed_at) < new Date(j.created_at));
    if (locked && !anyNew) continue;

    // get worker home base
    const { data: worker } = await sb.from("workers").select("lat,lng").eq("id", workerId).single();
    const home = worker?.lat != null ? { lat: worker.lat, lng: worker.lng } : { lat: jobs[0].lat, lng: jobs[0].lng };

    // build Google Directions optimize request
    const wp = jobs.map((j) => `${j.lat},${j.lng}`).join("|");
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${home.lat},${home.lng}&destination=${home.lat},${home.lng}&waypoints=optimize:true|${wp}&key=${GKEY}`;
    const g = await (await fetch(url)).json();
    if (g.status !== "OK") { results.push({ key, status: g.status }); continue; }

    const route = g.routes[0];
    const order: number[] = route.waypoint_order;
    const orderedIds = order.map((i) => jobs[i].id);
    let mins = 0, miles = 0;
    for (const leg of route.legs) { mins += leg.duration.value / 60; miles += leg.distance.value / 1609; }

    // save route (upsert)
    await sb.from("routes").upsert({
      worker_id: workerId, service_date: date,
      stop_order: orderedIds, total_minutes: Math.round(mins),
      total_miles: Math.round(miles * 10) / 10, locked, optimized_at: now.toISOString(),
    }, { onConflict: "worker_id,service_date" });

    // mark bookings routed
    await sb.from("bookings").update({ routed_at: now.toISOString() }).in("id", jobs.map((j) => j.id));
    results.push({ key, stops: jobs.length, minutes: Math.round(mins), locked });
  }

  return json({ ran_at: now.toISOString(), optimized: results.length, results });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "Content-Type": "application/json" } });
}
