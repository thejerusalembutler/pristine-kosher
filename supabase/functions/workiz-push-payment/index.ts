// Stage 4 — Mirror a money event onto the matching Workiz job.
// Handles all four kinds: deposit, balance, offline (Zelle/cash/check), discount.
// Idempotent: each (booking, event_key) is logged once in workiz_payment_log,
// so a retry can never double-record a payment.
//
// Workiz v1 (verified): POST /api/v1/{TOKEN}/job/addpayment/
//   body: { auth_secret, uuid, amount, type, date }
//   type is a payment method label (cash/credit/check/etc.); success -> { flag:true, data:{ paymentId } }

import { createClient } from "jsr:@supabase/supabase-js@2";

const TOKEN = Deno.env.get("WORKIZ_API_TOKEN")!;
const SECRET = Deno.env.get("WORKIZ_API_SECRET")!;
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function nowStamp() {
  // "YYYY-MM-DD HH:MM:SS" in local-ish format Workiz accepts
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

async function workizAddPayment(uuid: string, amount: number, type: string) {
  const res = await fetch(`https://api.workiz.com/api/v1/${TOKEN}/job/addpayment/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ auth_secret: SECRET, uuid, amount, type, date: nowStamp() }),
  });
  const data = await res.json();
  return { ok: data?.flag === true, paymentId: data?.data?.paymentId ?? null, data };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    // event: 'deposit' | 'balance' | 'offline' | 'discount'
    const { booking_id, event, amount, method } = await req.json();
    if (!booking_id || !event) return json({ error: "booking_id and event required" }, 400);

    const { data: b } = await sb.from("bookings")
      .select("id,workiz_job_id,offline_method").eq("id", booking_id).single();
    if (!b) return json({ error: "booking not found" }, 404);
    if (!b.workiz_job_id) return json({ ok: false, error: "booking not synced to Workiz yet" }, 409);

    // event_key makes the guardrail unique per logical event.
    // (offline can happen more than once, so allow a caller-supplied suffix via `method`+amount)
    const eventKey = event === "offline"
      ? `offline:${method || "pay"}:${amount}`
      : event;

    // already mirrored? no-op.
    const { data: existing } = await sb.from("workiz_payment_log")
      .select("id").eq("booking_id", booking_id).eq("event_key", eventKey).maybeSingle();
    if (existing) return json({ ok: true, alreadyLogged: true, eventKey });

    // discount is a negative adjustment; others are positive amounts.
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt === 0) return json({ error: "amount must be a non-zero number" }, 400);
    const workizAmount = event === "discount" ? -Math.abs(amt) : Math.abs(amt);

    // map the app's notion to a Workiz payment "type" (method label)
    const typeMap: Record<string, string> = {
      deposit: "credit", balance: "credit", discount: "discount",
      offline: (method || "cash").toLowerCase(),
    };
    const type = typeMap[event] || "cash";

    const r = await workizAddPayment(b.workiz_job_id, workizAmount, type);
    if (!r.ok) return json({ ok: false, error: r.data }, 502);

    // record it so it can never be logged again
    await sb.from("workiz_payment_log").insert({
      booking_id, event_key: eventKey, workiz_payment_id: String(r.paymentId ?? ""), amount: workizAmount,
    });

    // Keep the reverse-sync baseline current: this app-originated payment just
    // raised Workiz's "collected" total, so bump workiz_collected by the same amount.
    // (A positive payment; discounts are negative and reduce collected.)
    const { data: cur } = await sb.from("bookings").select("workiz_collected").eq("id", booking_id).single();
    await sb.from("bookings").update({
      workiz_collected: Number(cur?.workiz_collected ?? 0) + workizAmount,
    }).eq("id", booking_id);

    return json({ ok: true, eventKey, workiz_payment_id: r.paymentId, amount: workizAmount });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(x: unknown, s = 200) {
  return new Response(JSON.stringify(x), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
}
