// SMS sending for Pristine Kosher via Twilio.
// Actions: "arrival" | "confirmation" | "dispatch" | "blast"
import { createClient } from "jsr:@supabase/supabase-js@2";

const SID = Deno.env.get("TWILIO_ACCOUNT_SID")!;
const TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN")!;
const FROM = Deno.env.get("TWILIO_FROM_NUMBER")!;   // your Twilio number, e.g. +17325550100
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function e164(phone: string) {
  const d = (phone || "").replace(/[^0-9]/g, "");
  if (d.length === 10) return "+1" + d;
  if (d.length === 11 && d.startsWith("1")) return "+" + d;
  return d ? "+" + d : "";
}
async function sendSms(to: string, body: string, logCtx?: { name?: string; staff?: string }) {
  const dest = e164(to);
  if (!dest) return { ok: false, error: "no phone" };
  const auth = btoa(`${SID}:${TOKEN}`);
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: dest, From: FROM, Body: body }).toString(),
  });
  const data = await res.json();
  // log the outgoing message to the inbox
  if (res.ok) {
    try { await sb.from("messages").insert({ phone: dest, direction: "out", body, customer_name: logCtx?.name || null, staff_email: logCtx?.staff || null, twilio_sid: data.sid }); } catch (_) {}
  }
  return { ok: res.ok, data };
}
function fmt12(t: string) { if (!t) return ""; const [h, m] = t.split(":").map(Number); const ap = h >= 12 ? "PM" : "AM"; const hh = h % 12 || 12; return `${hh}:${String(m).padStart(2, "0")} ${ap}`; }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const b = await req.json();

    // Arrival status text to a customer (from worker's buttons)
    if (b.action === "arrival") {
      const { data: bk } = await sb.from("bookings").select("customer_name,phone").eq("id", b.booking_id).single();
      if (!bk?.phone) return json({ error: "no phone" }, 400);
      const first = (bk.customer_name || "there").split(" ")[0];
      const msgs: Record<string, string> = {
        omw: `Hi ${first}, this is your Pristine Kosher technician — I'm on my way to you now.`,
        ontime: `Hi ${first}, Pristine Kosher here — confirming I'll be there on time for your appointment.`,
        late15: `Hi ${first}, Pristine Kosher here — I'm running about 15 minutes late. Thank you for your patience.`,
      };
      const r = await sendSms(bk.phone, msgs[b.status] || "");
      return json({ ok: r.ok, error: r.ok ? null : r.data });
    }

    // Booking confirmation text
    if (b.action === "confirmation") {
      const { data: bk } = await sb.from("bookings").select("*").eq("id", b.booking_id).single();
      if (!bk?.phone) return json({ error: "no phone" }, 400);
      const first = (bk.customer_name || "there").split(" ")[0];
      const body = `Hi ${first}, your Pristine Kosher kashering is booked for ${bk.service_date || ""} ${fmt12(bk.time_slot)}. A $${bk.deposit_paid || 100} deposit is confirmed. We'll be in touch. — Pristine Kosher`;
      const r = await sendSms(bk.phone, body);
      return json({ ok: r.ok, error: r.ok ? null : r.data });
    }

    // Dispatch a worker their day's schedule
    if (b.action === "dispatch") {
      // b: { worker_id, date }
      const { data: w } = await sb.from("workers").select("name,phone").eq("id", b.worker_id).single();
      if (!w?.phone) return json({ error: "worker has no phone" }, 400);
      const { data: jobs } = await sb.from("bookings")
        .select("customer_name,address,time_slot,estimate")
        .eq("assigned_worker_id", b.worker_id).eq("service_date", b.date).order("time_slot");
      if (!jobs?.length) return json({ error: "no jobs that day" }, 400);
      let body = `Pristine Kosher — your schedule for ${b.date}:\n\n`;
      jobs.forEach((j, i) => { body += `${i + 1}. ${fmt12(j.time_slot)} — ${j.customer_name}\n   ${j.address}\n`; });
      body += `\n${jobs.length} jobs. Reply to the office with questions.`;
      const r = await sendSms(w.phone, body);
      return json({ ok: r.ok, error: r.ok ? null : r.data });
    }

    // Free-form: staff texts any message to any phone (the "text whatever I want" inbox)
    if (b.action === "send") {
      if (!b.phone || !b.message) return json({ error: "phone and message required" }, 400);
      const r = await sendSms(b.phone, b.message, { name: b.name, staff: b.staff });
      return json({ ok: r.ok, error: r.ok ? null : r.data });
    }

    // Blast (transactional guardrail: caller passes explicit list)
    if (b.action === "blast") {
      const list: string[] = b.to || [];
      if (!list.length || !b.message) return json({ error: "message and to[] required" }, 400);
      let sent = 0;
      for (const phone of list) {
        const r = await sendSms(phone, b.message + "\nReply STOP to opt out.");
        if (r.ok) sent++;
        await new Promise((res) => setTimeout(res, 120));
      }
      return json({ ok: true, sent, total: list.length });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) { return json({ error: String(e) }, 500); }
});
function json(x: unknown, s = 200) { return new Response(JSON.stringify(x), { status: s, headers: { ...cors, "Content-Type": "application/json" } }); }
