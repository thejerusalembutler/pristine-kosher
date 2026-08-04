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

// Pricing (mirrors the booking flow's single source of truth) so notes can show
// each line with its price — an itemized breakdown until real v2 line-items exist.
const PRICE = {
  counters: { small: 230, medium: 265, large: 300 } as Record<string, number>,
  sinks: { 1: 100, 2: 155, 3: 185 } as Record<string, number>,
  island: { small: 30, large: 50 } as Record<string, number>,
  addon: { stovetop: 50, warming: 40, microwave: 25, oven: 10 } as Record<string, number>,
};
const ADDON_LABEL: Record<string, string> = {
  stovetop: "Stovetop", warming: "Warming drawer", microwave: "Microwave", oven: "Oven",
};
function money(n: number) { return `$${n}`; }
function pad(label: string, price: number) {
  // "Counters (large) ............ $300"
  const left = label.length > 34 ? label.slice(0, 34) : label;
  const dots = ".".repeat(Math.max(2, 38 - left.length - money(price).length));
  return `${left} ${dots} ${money(price)}`;
}

// An itemized, invoice-like breakdown dropped into the Workiz job notes.
function buildComment(b: Record<string, unknown>): string {
  const items: string[] = [];
  let total = 0;

  const base = String(b.base || "").toLowerCase();
  if (base === "counters") {
    const size = String(b.size || "").toLowerCase();
    const p = PRICE.counters[size];
    if (p) { items.push(pad(`Counters (${size})`, p)); total += p; }
    if (b.island) {
      const ip = PRICE.island[String(b.island).toLowerCase()];
      if (ip) { items.push(pad(`Island (${b.island})`, ip)); total += ip; }
    }
  } else if (base === "sinks") {
    const n = Number(b.sink_count || 0);
    const p = PRICE.sinks[n];
    if (p) { items.push(pad(`Sinks (${n})`, p)); total += p; }
  }

  if (Array.isArray(b.addons)) {
    for (const a of b.addons as string[]) {
      const p = PRICE.addon[a];
      if (p) { items.push(pad(ADDON_LABEL[a] || a, p)); total += p; }
    }
  }

  const lines: string[] = ["— SERVICE —", ...items];
  const est = Number(b.estimate || total);
  lines.push(pad("TOTAL", est));
  if (b.flexibility) lines.push(`\nTiming: ${b.flexibility}`);
  if (b.notes) lines.push(`Customer notes: ${b.notes}`);
  lines.push(`\n[Booked via app · booking ${b.id}]`);
  return lines.join("\n");
}

function json(x: unknown, s = 200) {
  return new Response(JSON.stringify(x), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
}
