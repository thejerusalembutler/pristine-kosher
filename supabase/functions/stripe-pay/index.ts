// Secure Stripe payments for Pristine Kosher.
// Actions:
//  - "setup": create a Stripe customer + confirm the saved card + charge the $100 deposit,
//             then attach everything to the booking. Card details never touch our server —
//             the browser uses Stripe.js to create a PaymentMethod token (pm_...) first.
//  - "charge_balance": later, charge a saved card an amount (staff-triggered).
import { createClient } from "jsr:@supabase/supabase-js@2";

const STRIPE_SECRET = Deno.env.get("STRIPE_SECRET_KEY")!;
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const DEPOSIT_CENTS = 10000; // $100

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// tiny Stripe API helper (form-encoded)
async function stripe(path: string, params: Record<string,string>) {
  const body = new URLSearchParams(params).toString();
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${STRIPE_SECRET}`, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  return { ok: res.ok, data: await res.json() };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const b = await req.json();

    if (b.action === "setup") {
      // b: { payment_method, email, name, booking_id }
      const { payment_method, email, name, booking_id } = b;
      if (!payment_method) return json({ error: "payment_method required" }, 400);

      // 1. create a customer with the card attached
      const cust = await stripe("customers", {
        email: email || "", name: name || "",
        payment_method, "invoice_settings[default_payment_method]": payment_method,
      });
      if (!cust.ok) return json({ error: cust.data.error?.message || "customer failed" }, 400);
      const customerId = cust.data.id;

      // 2. charge the $100 deposit off the saved card (off_session, since it's now on file)
      const pi = await stripe("payment_intents", {
        amount: String(DEPOSIT_CENTS), currency: "usd", customer: customerId,
        payment_method, off_session: "true", confirm: "true",
        description: "Pristine Kosher — booking deposit", "receipt_email": email || "",
      });
      const depositOk = pi.ok && pi.data.status === "succeeded";

      // 3. grab last4 for display
      const pm = await fetch(`https://api.stripe.com/v1/payment_methods/${payment_method}`, {
        headers: { Authorization: `Bearer ${STRIPE_SECRET}` },
      }).then(r => r.json());
      const last4 = pm?.card?.last4 || null;

      // 4. save to the booking
      if (booking_id) {
        await sb.from("bookings").update({
          stripe_customer_id: customerId, stripe_payment_method: payment_method,
          deposit_paid: depositOk ? DEPOSIT_CENTS / 100 : 0,
          deposit_status: depositOk ? "paid" : "failed",
          card_last4: last4,
        }).eq("id", booking_id);
      }

      return json({ ok: depositOk, customer: customerId, last4, deposit: DEPOSIT_CENTS/100,
        error: depositOk ? null : (pi.data.error?.message || "deposit charge failed") });
    }

    if (b.action === "charge_balance") {
      // b: { booking_id, amount }  (staff-triggered, charges saved card)
      const { data: bk } = await sb.from("bookings")
        .select("stripe_customer_id,stripe_payment_method,customer_name,email,balance_charged")
        .eq("id", b.booking_id).single();
      if (!bk?.stripe_customer_id) return json({ error: "no saved card on this booking" }, 400);
      const cents = Math.round((+b.amount) * 100);
      const pi = await stripe("payment_intents", {
        amount: String(cents), currency: "usd", customer: bk.stripe_customer_id,
        payment_method: bk.stripe_payment_method, off_session: "true", confirm: "true",
        description: "Pristine Kosher — balance", "receipt_email": bk.email || "",
      });
      const ok = pi.ok && pi.data.status === "succeeded";
      if (ok) await sb.from("bookings").update({ balance_charged: (bk.balance_charged||0) + cents/100 }).eq("id", b.booking_id);
      return json({ ok, amount: cents/100, error: ok ? null : (pi.data.error?.message || "charge failed") });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) { return json({ error: String(e) }, 500); }
});
function json(x: unknown, s = 200) { return new Response(JSON.stringify(x), { status: s, headers: { ...cors, "Content-Type": "application/json" } }); }
