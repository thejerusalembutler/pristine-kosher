// Securely create a login account for a worker and link it to their worker record.
// Called from the dashboard when a staff member approves/sets up a worker.
// Uses the SERVICE ROLE key (server-side only) to create the auth user.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(SUPABASE_URL, SERVICE_KEY);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { worker_id, email } = await req.json();
    if (!worker_id || !email) return json({ error: "worker_id and email required" }, 400);

    // Invite the worker: creates their account and emails a link to SET THEIR OWN password.
    const { data: invited, error: iErr } = await sb.auth.admin.inviteUserByEmail(email, {
      data: { role: "worker", worker_id },
      redirectTo: "https://pristine-kosher.vercel.app/set-password.html",
    });
    if (iErr) return json({ error: iErr.message }, 400);

    // link the worker record to this login
    const { error: lErr } = await sb.from("workers")
      .update({ user_id: invited.user.id, email }).eq("id", worker_id);
    if (lErr) return json({ error: "invited but linking failed: " + lErr.message }, 500);

    return json({ ok: true, email, invited: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status, headers: { ...cors, "Content-Type": "application/json" },
  });
}
