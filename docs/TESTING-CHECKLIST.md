# Pristine Kosher — Testing Checklist (Workiz Sync)

Plain-English steps to test everything we built. Do them in order. Each says what to click
and what you should see. If something's wrong, note WHICH step and tell Claude.

Your live site: https://pristine-kosher.vercel.app
Your dashboard: https://pristine-kosher.vercel.app/dashboard.html
Your Workiz: app.workiz.com

**Tip:** do a hard refresh (Cmd+Shift+R) on the app pages first, so you're seeing the newest version.

---

## Test 1 — A new booking flows INTO Workiz
1. Go to the booking page: https://pristine-kosher.vercel.app  → "Book your kashering"
2. Make a real test booking (use your own name + phone so it's easy to find/delete after).
   Use a test card if it asks for payment: **4242 4242 4242 4242**, any future date, any CVC.
3. Finish the booking.
4. **In Workiz:** within a minute, a new job should appear with your name, address, and the
   booking details in the job notes.
   ✅ PASS if the job shows up in Workiz.

## Test 2 — The deposit shows in Workiz
1. Open that same job in Workiz.
2. Look at the payments / amount due.
   ✅ PASS if a **$100 deposit** is recorded on the job.

## Test 3 — The booking shows in your app dashboard
1. Go to the dashboard: https://pristine-kosher.vercel.app/dashboard.html (sign in)
2. Find your test booking in the list.
   ✅ PASS if it shows a green **"✓ Workiz"** badge (meaning it synced).

## Test 4 — Marking a job DONE in Workiz updates the app
1. In Workiz, open your test job and change its status to **Done**.
2. Wait ~10 minutes (the app checks Workiz every 10 min).
   (Or tell Claude "run the pull now" to check instantly.)
3. Refresh the dashboard.
   ✅ PASS if the booking now shows status **done**.

## Test 5 — Changing the worker/time in Workiz locks it in the app
1. In Workiz, open your test job and change the assigned worker or the appointment time.
2. Wait ~10 min (or ask Claude to run the pull).
3. Refresh the dashboard, open that booking.
   ✅ PASS if it shows a **🔒 lock** and says "Changed in Workiz."
4. Click **"Unlock — let AI reschedule"**.
   ✅ PASS if the lock clears.

## Test 6 — Offline payment + discount mirror to Workiz
1. In the dashboard, open your test booking.
2. Record an **offline payment** (e.g. $50 cash) and/or apply a **discount**.
3. Open the job in Workiz.
   ✅ PASS if the offline payment / discount shows on the Workiz job's payments.

---

## Cleanup after testing
When done, tell Claude "clean up my test booking [name]" and it'll remove the test job from
both Workiz and the app.

## Known limitation (not a bug)
- **Call & text logs** from Workiz do NOT yet show in the app's CRM. That feature needs Workiz's
  newer "v2" API keys (you currently have v1). It's a "later" item, not broken.
