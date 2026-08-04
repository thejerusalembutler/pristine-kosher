# Workiz Two-Way Sync — Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the Pristine Kosher app and Workiz so bookings, jobs, communication logs, and payments stay in step, with a lock model that lets secretaries edit jobs in Workiz without the AI overwriting them.

**Architecture:** The app is the front door (booking, Stripe, AI scheduling) and pushes jobs + payments to Workiz. The app periodically pulls jobs and call/SMS logs back from Workiz. Secretary edits pulled from Workiz "lock" a job so the AI routes around it; staff can unlock. All Workiz calls live in new Supabase Edge Functions; matching pins (`workiz_job_id`, `workiz_tech_id`) tie records together.

**Tech Stack:** Supabase (Postgres + Deno Edge Functions), Workiz REST API (token auth), Stripe (existing), pg_cron (existing), plain HTML/JS dashboard (existing).

## Global Constraints

- Never store card numbers — only Stripe tokens (existing rule). Same for Workiz: send payment *records*, never card data.
- The Workiz API token is a secret — stored only via `supabase secrets set`, never in code or the repo.
- The app is always written to FIRST; Workiz pushes happen after and retry on failure. A Workiz outage must never lose a booking or a payment.
- Every Workiz write carries a unique idempotency tag so it can never be recorded twice.
- Existing column names are exact: bookings use `assigned_worker_id`, `service_date`, `time_slot`, `lat`, `lng`, `deposit_paid`, `balance_charged`, `deposit_status`; workers use `id`, `user_id`, `lat`, `lng`.
- Follow the existing migration style: `alter table ... add column if not exists ...` in a timestamped file under `supabase/migrations/`.

---

## ⚠️ BLOCKER — Stage 0 (Noam's task, required before Stage 1+)

The Workiz-API tasks below (marked **[NEEDS WORKIZ DOCS]**) cannot be finalized until we have the
real Workiz API details. Noam will:

1. Log into Workiz → Settings → API (or Integrations/Developers) → generate an API token.
2. Copy the API documentation pages for: create job, list jobs, call logs, SMS logs, create
   payment, create technician, assign technician (and any webhooks).
3. Tell Claude "I have the token" (do NOT paste the token in chat) and share the docs text/
   screenshots.

Claude then fills in the exact base URL, endpoints, headers, and field names in the flagged tasks.
Until then, only the **app-side tasks (Group A)** below are ready to build.

---

## GROUP A — App-side scaffolding (ready now, no Workiz API needed)

These build the database columns, sync-status tracking, and the lock UI. They're safe to build and
test before we have the Workiz token, because they don't call Workiz yet.

### Task A1: Add Workiz sync columns to the database

**Files:**
- Create: `supabase/migrations/<timestamp>_workiz_sync_fields.sql`

**Interfaces:**
- Produces: new columns on `bookings` — `workiz_job_id text`, `workiz_sync_status text`
  (values: `pending` | `synced` | `error`), `workiz_synced_at timestamptz`,
  `ai_locked boolean default false`, `ai_locked_reason text`. New column on `workers` —
  `workiz_tech_id text`.

- [ ] **Step 1: Write the migration**

```sql
-- Workiz two-way sync: matching pins + sync status + AI lock
alter table bookings add column if not exists workiz_job_id text;          -- Workiz's job id (matching pin)
alter table bookings add column if not exists workiz_sync_status text default 'pending'; -- pending | synced | error
alter table bookings add column if not exists workiz_synced_at timestamptz;
alter table bookings add column if not exists ai_locked boolean default false;  -- true = secretary changed it in Workiz; AI routes around it
alter table bookings add column if not exists ai_locked_reason text;        -- e.g. 'workiz-edit: worker' / 'workiz-edit: schedule'

alter table workers add column if not exists workiz_tech_id text;           -- Workiz technician id (matching pin)

create index if not exists idx_bookings_workiz_job on bookings(workiz_job_id);
create index if not exists idx_bookings_sync_status on bookings(workiz_sync_status);
```

- [ ] **Step 2: Apply the migration**

Run: `supabase db push` (or apply via the Supabase dashboard SQL editor)
Expected: no errors; columns exist.

- [ ] **Step 3: Verify columns exist**

Run in Supabase SQL editor:
```sql
select column_name from information_schema.columns
where table_name='bookings' and column_name in
('workiz_job_id','workiz_sync_status','ai_locked');
```
Expected: 3 rows returned.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/<timestamp>_workiz_sync_fields.sql
git commit -m "feat: add Workiz sync + AI-lock columns to bookings and workers"
```

---

### Task A2: Show sync status + lock on the dashboard

**Files:**
- Modify: `dashboard.html` (the booking row renderer + drawer)

**Interfaces:**
- Consumes: `workiz_sync_status`, `workiz_job_id`, `ai_locked` from Task A1.
- Produces: a visible badge per booking (`✓ in Workiz` / `⏳ syncing` / `⚠️ not synced`) and a
  🔒 indicator on locked jobs, plus an "Unlock — let AI reschedule" button in the job drawer.

- [ ] **Step 1: Add a sync badge to each booking row**

In the booking row template in `dashboard.html`, add a small badge derived from
`workiz_sync_status`:
- `synced` → `✓ in Workiz` (teal)
- `pending` → `⏳ syncing` (muted)
- `error` → `⚠️ not synced` (orange)

- [ ] **Step 2: Add the 🔒 lock indicator**

When `ai_locked === true`, show a 🔒 on the row and, in the drawer, a line:
"Locked — changed in Workiz. The AI won't move this job."

- [ ] **Step 3: Add the Unlock button in the drawer**

Button "Unlock — let AI reschedule". On click, PATCH the booking:
`ai_locked = false, ai_locked_reason = null` via the existing Supabase REST pattern
(same auth headers already used in dashboard.html), then refresh the drawer.

- [ ] **Step 4: Manually verify**

Set one booking's `ai_locked=true` in the SQL editor, reload the dashboard, confirm the 🔒 shows
and the Unlock button clears it.

- [ ] **Step 5: Commit**

```bash
git add dashboard.html
git commit -m "feat: dashboard sync badges + AI-lock indicator and unlock button"
```

---

### Task A3: Teach the route optimizer to respect the AI lock

**Files:**
- Modify: `supabase/functions/optimize-routes/index.ts` (the booking query, ~line 33)

**Interfaces:**
- Consumes: `ai_locked` from Task A1.
- Produces: locked bookings are excluded from reordering — the optimizer treats them as fixed.

- [ ] **Step 1: Exclude locked jobs from reordering**

In the bookings query, add `ai_locked` to the `select`, and when building each worker-day's
route, hold any `ai_locked === true` booking at its existing `time_slot` (do not send it to Google
for reordering; route the unlocked jobs around it).

- [ ] **Step 2: Deploy and smoke-test**

Run: `supabase functions deploy optimize-routes`
Manually set one booking `ai_locked=true`, trigger the function, confirm that booking's slot is
unchanged while others reorder.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/optimize-routes/index.ts
git commit -m "feat: route optimizer leaves AI-locked jobs fixed"
```

---

## GROUP B — Workiz API integration [NEEDS WORKIZ DOCS]

These tasks are drafted in shape but their exact endpoints/fields are **placeholders** until
Noam supplies the Workiz API docs (Stage 0). Do NOT implement until the placeholders below are
replaced with real values.

### Task B1: Workiz API client + connection test **[NEEDS WORKIZ DOCS]**

**Files:**
- Create: `supabase/functions/workiz-sync/workiz-client.ts` (shared helper)

**Interfaces:**
- Produces: `workizFetch(path, opts)` helper that adds the auth token + base URL, and a
  `pingWorkiz()` that confirms the token works.

- [ ] **Step 1 (Noam):** `supabase secrets set WORKIZ_API_TOKEN=<token>` (Noam runs this himself so
  the token never appears in chat).
- [ ] **Step 2:** Implement `workizFetch` using `<<BASE_URL>>` and `<<AUTH_HEADER>>` **[fill from docs]**.
- [ ] **Step 3:** Implement `pingWorkiz()` calling the simplest read endpoint **[fill: e.g. list jobs, 1 result]**.
- [ ] **Step 4:** Deploy + invoke; expect a 200 and real data back. Confirms the token works.
- [ ] **Step 5:** Commit.

### Task B2: Push a booking to Workiz (Flow 1) **[NEEDS WORKIZ DOCS]**

Push job with full details (services, price, address, date/time) + assigned worker; store returned
`workiz_job_id`; set `workiz_sync_status='synced'`. Worker matching: if the assigned worker has no
`workiz_tech_id`, create the tech in Workiz first (Task B5), store the pin, then assign.
**[fill: create-job endpoint + field mapping from docs]**

### Task B3: Pull jobs from Workiz + apply locks (Flow 4) **[NEEDS WORKIZ DOCS]**

Periodic pull (pg_cron). For each Workiz job that maps to a booking, detect if the worker or
schedule differs from the app's copy → update the app + set `ai_locked=true`,
`ai_locked_reason`. Jobs created in Workiz with no matching booking → create a booking.
**[fill: list-jobs endpoint + updated-since filter + field names from docs]**

### Task B4: Pull call + SMS logs into the CRM (Flow 2) **[NEEDS WORKIZ DOCS]**

Pull call/SMS logs, match to customer by phone, store in a `communications` table, show in
`customers.html`. **[fill: call-log + sms-log endpoints from docs]**

### Task B5: Create/match technician in Workiz **[NEEDS WORKIZ DOCS]**

Helper: given an app worker, ensure a `workiz_tech_id` exists (create in Workiz if missing).
**[fill: create-technician endpoint from docs]**

### Task B6: Mirror every money event to Workiz (Flow 3) **[NEEDS WORKIZ DOCS]**

On deposit charge, balance charge (after Stripe confirms), offline payment recorded, and discount
applied → write the record to the matching Workiz job with a unique idempotency tag. Hook into the
existing `stripe-pay` function + the offline/discount handlers in `dashboard.html`.
**[fill: create-payment endpoint + fields from docs]**

### Task B7: Automations check **[NEEDS WORKIZ DOCS]**

Confirm Workiz's own automations fire on jobs created via B2 (no code — a live verification with
one test job). Document any field Workiz needs for automations to trigger.

---

## Self-review notes

- **Spec coverage:** Flows 1–4 → B2/B3/B4/B6; lock model → A1/A2/A3/B3; worker matching → B5/B2;
  safety (app-first, sync flags, idempotency) → A1/A2 + Global Constraints; AI scheduling around
  locks → A3. All spec sections mapped.
- **Placeholders:** Group A has none (real SQL/column names). Group B placeholders are
  **intentional and clearly flagged** — they depend on Workiz docs we don't have yet. This is the
  one allowed exception, called out explicitly so no one builds against a guess.
- **Ordering:** Group A is safe to build now; Group B waits on Stage 0.
