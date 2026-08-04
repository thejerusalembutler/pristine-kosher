# Pristine Kosher ↔ Workiz Two-Way Sync — Design

**Date:** 2026-08-02
**Author:** Noam Sonnenberg (with Claude)
**Status:** Design — awaiting review before implementation

---

## Plain-English summary

Pristine Kosher runs two tools that each do things the other can't. This project connects
them so both always have the information they need to do their own job.

- **The app (this project)** is the *smart brain and the front door*: guided customer booking,
  card-on-file via Stripe, AI "best-times" scheduling, route optimization, dispatch, worker
  portal, and the customer CRM. **New jobs are created here.**
- **Workiz** is the *communication hub*: phone calls + recording ("who took the call"), call
  logs, SMS logs, and its automations (automatic texts/reminders). Occasionally a job is also
  created directly in Workiz (e.g. when a team member logs a job during a phone call).

We are **not** building a fragile "mirror everything both ways" sync. Instead: mostly one-way
flows, plus one carefully-controlled two-way case for job edits, handled by the **lock model**
(see below) so the AI and the secretaries can never silently overwrite each other.

**How the team actually works (important):** secretaries live in Workiz. They click into a job
from the SMS/dashboard view and change the assigned worker or move the schedule, right in Workiz.
The design fits that habit rather than changing it.

---

## Goals

1. New bookings taken in the app appear in Workiz (so Workiz's calendar + automations work).
2. Jobs created directly in Workiz flow back to the app (so AI scheduling + dispatch see them).
3. Workiz's call logs and SMS logs are visible in the app's CRM.
4. Workiz automations keep working automatically on synced jobs.
5. Payments: **one place charges the card (the app's Stripe); every money event is mirrored to
   Workiz** — deposit, balance, offline (Zelle/cash/check), and discounts — so Workiz's financial
   record always matches the app's.
6. AI "best-times" recommendations keep working, using the complete picture of jobs from both
   systems.
7. When a secretary changes a job's worker or schedule in Workiz, the app respects it (via the
   lock model) and the AI routes around it — but staff can unlock a job to let the AI move it
   again.

## Non-goals (deliberately out of scope, for sturdiness)

- No "silent overwrite" conflicts: job edits are reconciled via the **lock model**, never by a
  race where the most recent write silently wins.
- Workiz never charges a card in this design — it only *records* that the app charged one.
- No historical data-matching headache: the app's data can be treated as fresh (TBD — see Open
  Questions).

---

## The four flows

```
   THE APP (front door + smart brain)            WORKIZ (comms hub)
        │  1. New booking ──────────────────►    │   job created; automations fire
        │  4. Pull latest jobs ◄─────────────    │   catches jobs made in Workiz (e.g. on a call)
        │  2. Call & SMS logs ◄──────────────    │   shown in the app's CRM
        │  3. Payment record ───────────────►    │   app's Stripe charges; Workiz told
```

**Flow 1 — Booking → Workiz (push).** When a booking is created in the app, the app saves it
locally first, then pushes it to Workiz via the Workiz API. The pushed job carries the **complete
booking**:

- Customer (name, phone, address)
- **What they booked** — services (counters/sinks/island), sizes, add-ons, and the price
- Date + time slot
- **The assigned worker** — matched to that worker's existing Workiz tech (see "Workers" below),
  so Workiz's calendar/dispatch shows the right technician on the job.

Workiz returns its own job ID, which the app stores next to the booking (the "matching pin",
`workiz_job_id`).

**Flow 2 — Call/SMS logs → app (pull).** The app periodically reads Workiz's call and SMS logs
and attaches them to the matching customer (matched by phone number), shown in the CRM.

**Flow 3 — Every money event → Workiz (push).** Workiz gets the **complete** financial picture
for each job, matching the app exactly. All four kinds of money event are logged to the correct
Workiz job (via the matching pin), each with a unique tag so it can never be recorded twice:

- **Deposit** ($100 card-on-file, taken at booking) — logged *after* Stripe confirms the charge.
- **Balance charge** (remaining amount from the saved card) — logged *after* Stripe confirms.
- **Offline payments** (Zelle / cash / check — recorded, not charged through the app) — logged the
  moment they're recorded in the app (no Stripe step to wait on).
- **Discounts** — the adjustment is written to Workiz so the job totals match.

The Stripe-charged events (deposit, balance) are only written to Workiz *after* Stripe confirms
success. The non-Stripe events (offline, discount) are written the moment they're recorded. In all
cases the unique tag prevents double-recording across retries.

Combined with Flow 1 (full job details), Workiz ends up holding a complete record for every job:
what was booked, the price, the assigned worker, and every payment/adjustment.

**Flow 4 — Jobs from Workiz → app (pull).** The app periodically pulls the latest jobs from
Workiz so that jobs created directly in Workiz are visible to AI scheduling and dispatch. This is
read-only on the app side.

---

## The matching problem (most important detail)

Both systems must agree on "same customer" and "same job," or duplicates appear.

- **Jobs:** when the app pushes a booking, Workiz returns its job ID. The app stores that ID
  (`workiz_job_id`) on the booking. All later cross-references use it.
- **Customers / calls:** matched by **phone number**, because a call can arrive from someone who
  isn't tied to a job yet.
- **The one rule that prevents chaos:** a given job is *created* in exactly one place, then shared.
  The app and Workiz never independently create the same job.

---

## Workers (technician matching)

Jobs pushed to Workiz include the assigned technician, so Workiz's dispatch shows who's doing
each job. Workers are matched with a "pin" the same way jobs are (`workiz_tech_id` stored on each
worker).

- **Existing workers** already exist in Workiz → matched once to their Workiz tech.
- **New workers** (who applied through the app's application form) do **not** exist in Workiz yet.
  When a new app-worker is first assigned a job, the app **automatically creates them as a tech in
  Workiz** (once), stores the returned `workiz_tech_id`, then pushes the assignment. Every
  subsequent job just reuses that pin.

**Rule the push follows:** before assigning a worker to a Workiz job, check for a `workiz_tech_id`.
If missing → create the tech in Workiz first, save the pin, then assign.

---

## The lock model (how job edits from Workiz are handled)

This is the heart of how the AI and the secretaries coexist without stepping on each other.

**Every job starts AI-optimizable.** At booking, the app's AI picks the best worker + time.

**A secretary's Workiz change locks the job.** When the app pulls jobs from Workiz (Flow 4) and
sees that a secretary changed the assigned worker or the schedule (time/date), the app treats that
change *like a customer request* — a fixed preference — and marks the job **locked**. Both the
worker and the time/date are locked together.

**The AI routes around locked jobs.** A locked job is a fixed point the AI must schedule around,
exactly like a hard customer constraint. The AI keeps optimizing all the *unlocked* jobs, so it
stays useful during crunch instead of going idle after booking — it just never moves a locked one.

**Staff can unlock.** Each locked job shows a 🔒 in the app dashboard with an
**"Unlock — let AI reschedule"** button. Clicking it clears the lock, and the AI is free to
optimize that job again on the next run.

**Why this is the smooth path:**
- Secretaries change nothing about their habit — they keep editing jobs in Workiz from the SMS/
  dashboard view.
- There is never a silent overwrite: a secretary's edit becomes a lock the AI physically respects.
- The AI still adds value continuously (optimizing everything not locked), and staff keep final
  control via the unlock button.

**Trade-off (stated honestly):** the AI does not force-re-optimize a job after a secretary has
touched it (it's locked). The AI sets a smart starting point; the team steers from there. A future
nicety could have the AI *suggest* a better slot for a locked job without moving it — out of scope
for now.

---

## Safety (what happens when the connection hiccups)

1. **Booking saved in the app first, then pushed to Workiz.** A Workiz outage never loses a
   booking or a saved card. The push retries until it succeeds.
2. **Every job shows a sync status flag** in the dashboard: `✓ in Workiz` / `⏳ syncing` /
   `⚠️ needs attention`. No silent failures.
3. **Payments written to Workiz only after Stripe confirms the charge.** Unique tag per payment
   prevents double-recording, even across retries.
4. **A "resync" button** re-pushes a job to Workiz for simple manual recovery.

**Principle:** the app is the safe home base for bookings and money; Workiz is kept in step, but a
Workiz problem can never break the app's core operation.

---

## AI scheduling in this world

The AI "best-times" feature runs **inside the app, during booking, before the job is pushed to
Workiz.** To recommend good slots it needs every existing job. Because jobs can occasionally be
created in Workiz too, the app pulls Workiz jobs (Flow 4) and combines them with its own, so the
AI always sees the complete picture and never recommends a slot that's actually taken.

---

## Build stages (each tested and working before the next)

- **Stage 0 — Get the Workiz API token.** (User action: generate token in Workiz developer
  settings. Claude will give exact click-by-click steps.)
- **Stage 1 — Push a booking into Workiz.** Prove one booking flows across, gets its Workiz ID,
  and shows the `✓ in Workiz` flag. Test with one fake booking.
- **Stage 2 — Pull jobs from Workiz.** Read-only; AI + dispatch see the full picture.
- **Stage 3 — Pull call + SMS logs.** Show comms history in the CRM.
- **Stage 4 — Payments (careful).** App's Stripe charges; record mirrored to Workiz with the
  no-double-record guardrail. Tested with tiny test amounts first.
- **Stage 5 — Automations check.** Confirm Workiz automations fire on synced jobs.

Each stage is a visible "slice." Value arrives early — Stage 1 alone (bookings → Workiz) is useful.

---

## Technical notes

- **Workiz API:** documented at developer.workiz.com. Base URL `https://api.workiz.com/api/v1/`.
  Auth is a static token from the developer portal. Supports pulling clients, jobs, schedules,
  invoices, payments, call/SMS logs; and pushing jobs, dispatch, status, payments. Webhooks exist
  for async notifications (e.g. job created / payment settled).
- **App side:** Supabase (Postgres + Edge Functions in Deno). Sync logic lives in new Edge
  Functions; a `workiz_job_id` column (and sync-status column) is added to `bookings`.
- **Scheduling of pulls:** pg_cron (already used for route optimization) can drive periodic pulls
  for Flows 2 and 4.
- **Payments:** Stripe stays the single charging authority. Workiz receives a payment *record*
  only, keyed by a unique idempotency tag.

---

## Open questions (to resolve before/at Stage 0)

1. **App's existing data:** the app currently holds ~515 imported customers + ~1,626 past jobs.
   Decision deferred ("not yet"). Options: wipe and re-pull fresh from Workiz; keep and sync new
   only; or wipe and start empty. Revisit before Stage 1.
2. **Pull frequency** for Flows 2 & 4 (e.g. every 5–15 min vs. on-demand) — tune during build.
3. **Which Workiz fields** map to which app fields (service type, price, address) — confirm at
   Stage 1 against the live Workiz account.
