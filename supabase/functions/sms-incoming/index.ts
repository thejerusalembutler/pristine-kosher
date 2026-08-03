// Twilio webhook: receives incoming SMS from customers and logs them.
// Configure your Twilio number's "A MESSAGE COMES IN" webhook to POST here.
import { createClient } from "jsr:@supabase/supabase-js@2";
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

function norm(p: string){ const d=(p||"").replace(/[^0-9]/g,""); return d.length===11&&d.startsWith("1")?"+"+d:(d.length===10?"+1"+d:"+"+d); }

Deno.serve(async (req) => {
  try {
    // Twilio posts form-encoded
    const form = await req.formData();
    const from = norm(String(form.get("From") || ""));
    const body = String(form.get("Body") || "");
    const sid = String(form.get("MessageSid") || "");

    // best-known name for this phone (from customers or bookings)
    let name = null;
    const { data: c } = await sb.from("customers").select("full_name").eq("phone", from).limit(1).maybeSingle();
    if (c?.full_name) name = c.full_name;

    await sb.from("messages").insert({ phone: from, direction: "in", body, customer_name: name, twilio_sid: sid });

    // respond with empty TwiML (no auto-reply)
    return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      headers: { "Content-Type": "text/xml" },
    });
  } catch (e) {
    return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', { headers: { "Content-Type": "text/xml" } });
  }
});
