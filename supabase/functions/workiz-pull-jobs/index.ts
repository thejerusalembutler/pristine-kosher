// Stage 2 — Pull jobs FROM Workiz into the app (read-only on the Workiz side).
// For each Workiz job:
//   • If it matches a booking (by workiz_job_id): check whether the assigned tech
//     or the schedule changed in Workiz. If so, apply the AI LOCK (per the design) —
//     the app updates its copy and marks ai_locked=true so the optimizer routes around it.
//   • If it has no matching booking (created directly in Workiz): create a booking,
//     using Workiz's own Latitude/Longitude (cost-saver — no Google geocode needed).
//
// Meant to be run on a schedule (pg_cron) and callable manually.
// Workiz read (verified): GET /api/v1/{TOKEN}/job/all/?start_date=...&offset=..&records=..&only_open=false

import { createClient } from "jsr:@supabase/supabase-js@2";

const TOKEN = Deno.env.get("WORKIZ_API_TOKEN")!;
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type WJob = {
  UUID: string;
  JobDateTime?: string;         // "2027-04-14 10:00:00"
  Status?: string;
  FirstName?: string; LastName?: string; Phone?: string; Email?: string;
  Address?: string; City?: string; State?: string; PostalCode?: string;
  Latitude?: number; Longitude?: number;
  JobTotalPrice?: number;
  Team?: { id: number; Name: string }[];
};

// Workiz caps `records` at 100 per call, so page through with offsets.
async function fetchWorkizJobs(maxPages = 20): Promise<WJob[]> {
  const PAGE = 100;
  const all: WJob[] = [];
  for (let page = 0; page < maxPages; page++) {
    const offset = page * PAGE;
    const url = `https://api.workiz.com/api/v1/${TOKEN}/job/all/?start_date=2020-01-01&offset=${offset}&records=${PAGE}&only_open=false`;
    const res = await fetch(url);
    const data = await res.json();
    if (data?.flag !== true || !Array.isArray(data.data) || data.data.length === 0) break;
    all.push(...data.data);
    if (data.data.length < PAGE) break;   // last page
  }
  return all;
}

// Split "2027-04-14 10:00:00" -> { date:"2027-04-14", time:"10:00" }
function splitDateTime(dt?: string): { date: string | null; time: string | null } {
  if (!dt) return { date: null, time: null };
  const [d, t] = dt.split(" ");
  return { date: d || null, time: t ? t.slice(0, 5) : null };
}
function teamName(j: WJob): string | null {
  return j.Team && j.Team.length ? j.Team[0].Name : null;
}

// Map a Workiz job status onto the app's booking status.
// Workiz statuses seen: "Submitted", "Done", "Cancelled", etc.
function mapStatus(workizStatus?: string): string | null {
  const s = (workizStatus || "").toLowerCase();
  if (!s) return null;
  if (s.includes("done") || s.includes("complete")) return "done";
  if (s.includes("cancel")) return "declined";
  if (s.includes("submitted") || s.includes("pending") || s.includes("new")) return "confirmed";
  return null; // unknown status -> leave the app's status alone
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dry_run === true;   // report what WOULD happen, write nothing
    const jobs = await fetchWorkizJobs();
    let matched = 0, locked = 0, created = 0, unchanged = 0;

    for (const j of jobs) {
      if (!j.UUID) continue;
      const { date, time } = splitDateTime(j.JobDateTime);

      // find a booking already tied to this Workiz job
      const { data: existing } = await sb
        .from("bookings")
        .select("id,service_date,time_slot,assigned_worker_id,ai_locked,status")
        .eq("workiz_job_id", j.UUID)
        .maybeSingle();

      if (existing) {
        matched++;
        // did the schedule change in Workiz vs. what the app has?
        const scheduleChanged =
          (date && date !== (existing.service_date ?? null)) ||
          (time && time !== (existing.time_slot ?? null));

        // did the tech change? match Workiz tech name -> app worker
        const wName = teamName(j);
        let workerChanged = false, appWorkerId: string | null = existing.assigned_worker_id ?? null;
        if (wName) {
          const { data: w } = await sb.from("workers").select("id,name").ilike("name", wName).maybeSingle();
          if (w && w.id !== existing.assigned_worker_id) { workerChanged = true; appWorkerId = w.id; }
        }

        // did the status change in Workiz? (e.g. marked "Done")
        const newStatus = mapStatus(j.Status);
        const statusChanged = newStatus !== null && newStatus !== (existing.status ?? null);

        if (scheduleChanged || workerChanged || statusChanged) {
          const reason = [scheduleChanged ? "schedule" : null, workerChanged ? "worker" : null, statusChanged ? "status" : null]
            .filter(Boolean).join("+");
          if (!dryRun) {
            const patch: Record<string, unknown> = {
              service_date: date ?? existing.service_date,
              time_slot: time ?? existing.time_slot,
              assigned_worker_id: appWorkerId,
            };
            if (statusChanged) patch.status = newStatus;
            // schedule/worker edits lock the job; a pure status change (e.g. "Done") does NOT
            // need to lock it, but if it was already locked we leave it locked.
            if (scheduleChanged || workerChanged) {
              patch.ai_locked = true;
              patch.ai_locked_reason = `workiz-edit: ${reason}`;
            }
            await sb.from("bookings").update(patch).eq("id", existing.id);
          }
          locked++;
        } else {
          unchanged++;
        }
      } else {
        // job created directly in Workiz — bring it into the app.
        // Use Workiz's own lat/lng (cost-saver: skip Google geocoding).
        created++;
        if (dryRun) continue;
        await sb.from("bookings").insert({
          status: "new",
          customer_name: `${j.FirstName ?? ""} ${j.LastName ?? ""}`.trim() || "Workiz customer",
          phone: j.Phone ?? null,
          email: j.Email ?? null,
          address: [j.Address, j.City, j.State, j.PostalCode].filter(Boolean).join(", "),
          service_date: date,
          time_slot: time,
          estimate: j.JobTotalPrice ?? null,
          lat: j.Latitude ?? null,
          lng: j.Longitude ?? null,
          workiz_job_id: j.UUID,
          workiz_sync_status: "synced",
          workiz_synced_at: new Date().toISOString(),
          ai_locked: true,                 // came from Workiz -> respect it
          ai_locked_reason: "created-in-workiz",
        });
      }
    }

    return json({ ok: true, pulled: jobs.length, matched, locked, unchanged, created });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(x: unknown, s = 200) {
  return new Response(JSON.stringify(x), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
}
