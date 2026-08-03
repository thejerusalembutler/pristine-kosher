// Email sending for Pristine Kosher via Resend.
// Actions: "confirmation" | "receipt" | "reminder" | "blast"
// Card/customer data comes from the booking_id where relevant.
import { createClient } from "jsr:@supabase/supabase-js@2";

const RESEND_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM = Deno.env.get("EMAIL_FROM") || "Pristine Kosher <onboarding@resend.dev>";
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BRAND_TEAL = "#20A59F";
function shell(title: string, body: string, footerNote = "") {
  return `<!doctype html><html><body style="margin:0;background:#f4f6f5;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0a0a0a">
    <div style="max-width:560px;margin:0 auto;padding:24px">
      <div style="background:#0a0a0a;border-radius:14px 14px 0 0;padding:22px 26px;color:#fff">
        <div style="font-weight:800;letter-spacing:.14em;font-size:14px">PRISTINE <span style="color:${BRAND_TEAL}">KOSHER</span></div>
      </div>
      <div style="background:#fff;border-radius:0 0 14px 14px;padding:28px 26px">
        <h1 style="font-size:20px;margin:0 0 14px">${title}</h1>
        ${body}
      </div>
      <div style="text-align:center;color:#5c6663;font-size:12px;padding:18px 10px">
        ${footerNote}
        Pristine Kosher · Expanding Kosher Convenience<br>
        <a href="tel:8457567437" style="color:#5c6663">845·756·7437</a> · <a href="mailto:info@pristinekosher.com" style="color:#5c6663">info@pristinekosher.com</a>
      </div>
    </div></body></html>`;
}
function row(k: string, v: string) {
  return `<tr><td style="padding:7px 0;color:#5c6663;font-size:14px">${k}</td><td style="padding:7px 0;text-align:right;font-weight:600;font-size:14px">${v}</td></tr>`;
}
async function send(to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  return { ok: res.ok, data: await res.json() };
}
function fmtDate(d: string) {
  if (!d) return "—";
  try { return new Date(d + "T00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }); }
  catch { return d; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const b = await req.json();

    if (b.action === "confirmation" || b.action === "reminder" || b.action === "receipt") {
      const { data: bk } = await sb.from("bookings").select("*").eq("id", b.booking_id).single();
      if (!bk?.email) return json({ error: "no email on booking" }, 400);
      const total = discounted(bk);
      const first = (bk.customer_name || "there").split(" ")[0];

      if (b.action === "confirmation") {
        const html = shell("Your booking is confirmed 🎉", `
          <p style="font-size:15px;color:#333">Hi ${first}, thank you for booking with Pristine Kosher. Here are your details:</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;border-top:1px solid #eee;border-bottom:1px solid #eee">
            ${row("Date", fmtDate(bk.service_date))}
            ${row("Time", bk.time_slot || "—")}
            ${row("Address", bk.address || "—")}
            ${row("Estimate", "$" + total)}
            ${bk.deposit_paid ? row("Deposit paid", "$" + bk.deposit_paid) : ""}
          </table>
          <p style="font-size:14px;color:#5c6663">A team member will confirm your final time. Your card is on file — the balance is charged after your kitchen is kashered.</p>`);
        const r = await send(bk.email, "Your Pristine Kosher booking is confirmed", html);
        return json({ ok: r.ok, error: r.ok ? null : r.data });
      }
      if (b.action === "reminder") {
        const html = shell("Your kashering is coming up", `
          <p style="font-size:15px;color:#333">Hi ${first}, this is a reminder that your kitchen kashering is scheduled for:</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;border-top:1px solid #eee;border-bottom:1px solid #eee">
            ${row("Date", fmtDate(bk.service_date))}
            ${row("Time", bk.time_slot || "—")}
          </table>
          <p style="font-size:14px;color:#5c6663">Please make sure surfaces are clean and clear where possible. Your technician will handle the rest.</p>`);
        const r = await send(bk.email, "Reminder: your Pristine Kosher appointment", html);
        return json({ ok: r.ok, error: r.ok ? null : r.data });
      }
      if (b.action === "receipt") {
        const paid = (+bk.deposit_paid || 0) + (+bk.balance_charged || 0) + (+bk.offline_paid || 0) + (+bk.cash_collected || 0);
        const html = shell("Payment receipt", `
          <p style="font-size:15px;color:#333">Thank you, ${first}. Here is your receipt:</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;border-top:1px solid #eee;border-bottom:1px solid #eee">
            ${row("Service", "Kitchen kashering")}
            ${row("Total", "$" + total)}
            ${row("Paid", "$" + paid)}
            ${paid < total ? row("Balance", "$" + (total - paid)) : ""}
          </table>`);
        const r = await send(bk.email, "Your Pristine Kosher receipt", html);
        return json({ ok: r.ok, error: r.ok ? null : r.data });
      }
    }

    if (b.action === "blast") {
      // b: { subject, message_html, to: [emails] }  — sends individually (with unsubscribe note)
      const list: string[] = b.to || [];
      if (!list.length || !b.subject) return json({ error: "subject and to[] required" }, 400);
      let sent = 0;
      for (const email of list) {
        const html = shell(b.subject, b.message_html || "",
          `<a href="mailto:info@pristinekosher.com?subject=Unsubscribe" style="color:#5c6663">Unsubscribe</a> · `);
        const r = await send(email, b.subject, html);
        if (r.ok) sent++;
        await new Promise((res) => setTimeout(res, 60)); // gentle pacing
      }
      return json({ ok: true, sent, total: list.length });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) { return json({ error: String(e) }, 500); }
});

function discounted(bk: any) {
  let t = bk.estimate || 0;
  if (bk.discount_type === "percent") t = t * (1 - (bk.discount_value || 0) / 100);
  else if (bk.discount_type === "amount") t = t - (bk.discount_value || 0);
  return Math.max(0, Math.round(t));
}
function json(x: unknown, s = 200) { return new Response(JSON.stringify(x), { status: s, headers: { ...cors, "Content-Type": "application/json" } }); }
