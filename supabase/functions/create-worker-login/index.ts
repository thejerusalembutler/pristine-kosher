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
    let { worker_id, worker_name, email, password } = await req.json();
    // allow looking up the worker by name (server-side, service role)
    if (!worker_id && worker_name) {
      const { data: w } = await sb.from("workers").select("id").eq("name", worker_name).single();
      if (w) worker_id = w.id;
    }
    if (!worker_id || !email) return json({ error: "worker_id (or worker_name) and email required" }, 400);

    let userId: string;
    if (password) {
      // direct-create with a password (used for testing, or offices that prefer setting passwords)
      const { data: created, error: cErr } = await sb.auth.admin.createUser({
        email, password, email_confirm: true,
        user_metadata: { role: "worker", worker_id },
      });
      if (cErr) return json({ error: cErr.message }, 400);
      userId = created.user.id;
    } else {
      // invite: worker sets their own password via emailed link
      const { data: invited, error: iErr } = await sb.auth.admin.inviteUserByEmail(email, {
        data: { role: "worker", worker_id },
        redirectTo: "https://pristine-kosher.vercel.app/set-password.html",
      });
      if (iErr) return json({ error: iErr.message }, 400);
      userId = invited.user.id;
    }

    // link the worker record to this login
    const { error: lErr } = await sb.from("workers")
      .update({ user_id: userId, email }).eq("id", worker_id);
    if (lErr) return json({ error: "created but linking failed: " + lErr.message }, 500);

    return json({ ok: true, email, invited: !password });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status, headers: { ...cors, "Content-Type": "application/json" },
  });
}
