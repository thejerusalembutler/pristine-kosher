// Stage 1 — Push a booking from the app INTO Workiz.
// Given a booking id, read the booking, map it to Workiz's job fields,
// create the job in Workiz (v1 API), and store the returned UUID + sync status
// back on the booking. Safe to call repeatedly: if already synced, it no-ops.
//
// Workiz v1 create-job (verified): POST /api/v1/{TOKEN}/job/create/
//   required: FirstName, LastName, Phone, Address, City, State, PostalCode, JobType, auth_secret
//   success  -> { flag:true, data:[{ UUID, SerialId, ClientId }] }

import { createClient } from "jsr:@supabase/supabase-js@2";

const TOKEN = Deno.env.get("WORKIZ_API_TOKEN")!;
const SECRET = Deno.env.get("WORKIZ_API_SECRET")!;
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const WORKIZ_JOB_TYPE = "Kashering and Shaimos Pickup"; // matches the real Workiz job type on the account

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Split "First Last" into first + last (last word is last name; rest is first).
function splitName(full: string): { first: string; last: string } {
  const parts = (full || "").trim().split(/\s+/);
  if (parts.length === 0 || parts[0] === "") return { first: "Customer", last: "-" };
  if (parts.length === 1) return { first: parts[0], last: "-" };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

// Parse a Google formatted address "123 Main St, Lakewood, NJ 08701, USA"
// into street / city / state / zip. Falls back gracefully if the shape differs.
function parseAddress(addr: string): { street: string; city: string; state: string; zip: string } {
  const raw = (addr || "").replace(/,\s*USA$/i, "").trim();
  const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
  const street = parts[0] || raw || "Unknown";
  const city = parts.length >= 2 ? parts[1] : "";
  let state = "", zip = "";
  const tail = parts[parts.length - 1] || "";
  const m = tail.match(/([A-Za-z]{2})\s*(\d{5})?/);
  if (m) { state = m[1] || ""; zip = m[2] || ""; }
  return { street, city, state, zip };
}

async function workizCreateJob(fields: Record<string, unknown>) {
  const res = await fetch(`https://api.workiz.com/api/v1/${TOKEN}/job/create/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ auth_secret: SECRET, ...fields }),
  });
  const data = await res.json();
  return { ok: res.ok && data.flag === true, data };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { booking_id } = await req.json();
    if (!booking_id) return json({ error: "booking_id required" }, 400);

    const { data: b, error } = await sb.from("bookings").select("*").eq("id", booking_id).single();
    if (error || !b) return json({ error: "booking not found" }, 404);

    // already synced? no-op (idempotent).
    if (b.workiz_job_id) {
      return json({ ok: true, alreadySynced: true, workiz_job_id: b.workiz_job_id });
    }

    const { first, last } = splitName(b.customer_name);
    const { street, city, state, zip } = parseAddress(b.address);

    const fields: Record<string, unknown> = {
      FirstName: first,
      LastName: last,
      Phone: (b.phone || "").replace(/[^0-9]/g, "") || "0000000000",
      Email: b.email || "",
      Address: street,
      City: city || "Lakewood",
      State: state || "NJ",
      PostalCode: zip || "08701",
      JobType: WORKIZ_JOB_TYPE,
      JobDateTime: b.service_date ? `${b.service_date} ${(b.time_slot || "09:00")}:00`.replace(/::/, ":") : undefined,
      JobNotes: buildComment(b),
    };
    // drop undefined
    Object.keys(fields).forEach((k) => fields[k] === undefined && delete fields[k]);

    const r = await workizCreateJob(fields);

    if (r.ok) {
      const uuid = r.data?.data?.[0]?.UUID ?? null;
      await sb.from("bookings").update({
        workiz_job_id: uuid,
        workiz_sync_status: "synced",
        workiz_synced_at: new Date().toISOString(),
      }).eq("id", booking_id);
      return json({ ok: true, workiz_job_id: uuid, serialId: r.data?.data?.[0]?.SerialId });
    } else {
      await sb.from("bookings").update({ workiz_sync_status: "error" }).eq("id", booking_id);
      return json({ ok: false, error: r.data }, 502);
    }
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

// A readable summary of what was booked, dropped into the Workiz job comments.
function buildComment(b: Record<string, unknown>): string {
  const lines: string[] = [];
  if (b.base) lines.push(`Service: ${b.base}`);
  if (b.size) lines.push(`Size: ${b.size}`);
  if (b.sink_count) lines.push(`Sinks: ${b.sink_count}`);
  if (b.island) lines.push(`Island: ${b.island}`);
  if (Array.isArray(b.addons) && b.addons.length) lines.push(`Add-ons: ${(b.addons as string[]).join(", ")}`);
  if (b.estimate) lines.push(`Estimate: $${b.estimate}`);
  if (b.flexibility) lines.push(`Flexibility: ${b.flexibility}`);
  if (b.notes) lines.push(`Notes: ${b.notes}`);
  lines.push(`[Booked via app · booking ${b.id}]`);
  return lines.join("\n");
}

function json(x: unknown, s = 200) {
  return new Response(JSON.stringify(x), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
}
