# Workiz API — Working Connection Notes (verified 2026-08-04)

**Status: ✅ CONNECTED.** The API works on Noam's current plan (NO Ultimate needed). Reads confirmed
with real account data.

## The credentials (v1)

Two keys from Workiz → Settings → Integrations → Developer (v1 section):
- **Token**: starts `api_...` — stored in Supabase secret `WORKIZ_API_TOKEN`
- **Secret**: starts `sec_...` — stored in Supabase secret `WORKIZ_API_SECRET`

The token is enough for READ calls. The secret is for "signed" write actions (to confirm on write
tasks).

## The winning format (this is what took 30 tries to find)

**Base:** `https://api.workiz.com/api/v1/`
**The TOKEN goes FIRST in the URL path, right after `/v1/`.** This was the key insight — not after
the resource name.

**Working read call (list jobs):**
```
GET https://api.workiz.com/api/v1/{TOKEN}/job/all/?start_date=2020-01-01&offset=0&records=50&only_open=false
```

Returns: `{ "flag": true, "data": [ { job }, ... ] }`  (`flag:true` = success)

### What did NOT work (so we don't retry)
- Anything on `/crm/api/v2/...` — those need **v2** credentials (Noam only has v1 keys). All v2
  attempts returned `401 {"valid":false}`.
- Token placed AFTER the resource (`/job/all/{TOKEN}/`) → `Forbidden / malformed API key`.
- `Authorization: Bearer` headers → rejected (that's the v2 style).

## Real job fields (from live data)

| Workiz field | Meaning | Maps to app |
|---|---|---|
| `UUID` | Workiz job id | `bookings.workiz_job_id` (matching pin) |
| `SerialId` | human job number | reference |
| `JobDateTime` / `JobEndDateTime` | schedule | `service_date` + `time_slot` |
| `JobTotalPrice` / `JobAmountDue` / `SubTotal` | money | estimate / balance |
| `Status` / `SubStatus` | job status | status |
| `Phone` / `Email` / `FirstName` / `LastName` | customer | customer match (by phone) |
| `Address` / `City` / `State` / `LocationKey` | address | address + geocode |
| `LineItems` | what they booked | services/add-ons |
| `ClientId` | Workiz client id | customer pin |

## Verified WRITE endpoints (2026-08-04)

**Writes require the SECRET**, passed as `auth_secret` in the JSON body (token still in URL path).

### Create a job — `POST /api/v1/{TOKEN}/job/create/`
Body (JSON). Required fields (discovered by probing):
`FirstName`, `LastName`, `Phone`, `Address`, `City`, `State`, `PostalCode`, `JobType`,
plus `auth_secret`. Optional: `JobDateTime`, `Email`, `Comments`, `JobNotes`, etc.
Success → `{"flag":true,"msg":"Created Job","data":[{"UUID":"...","SerialId":"...","ClientId":"..."}],"code":201}`
The returned `UUID` is the matching pin to store on the booking.

### Delete a job — `POST /api/v1/{TOKEN}/job/delete/`
Body: `{ "auth_secret": "...", "ID": "<the job UUID>" }`  (field is `ID`, value is the UUID).
Success → `{"flag":true,"msg":"Job deleted"}`

## Endpoints to confirm next (v1)

- Assign technician to a job (Team field) — find endpoint.
- Call logs / SMS logs — find v1 endpoint names.
- Create payment — likely needs the SECRET (signed) — verify.
- Technicians list/create — for worker assignment.

## Test function

`supabase/functions/workiz-test/index.ts` — self-diagnosing prober. Kept for future auth debugging.

## Live status (2026-08-04)
- Test bookings wiped (was 218 junk rows). Bookings table started fresh.
- Stage 2 pull run LIVE: 98 real Workiz jobs now in the app, all with workiz_job_id,
  ai_locked=true (came from Workiz), and Workiz lat/lng (no Google geocode).
- Workiz has ~100 jobs total (page 2 empty). `records` max = 100/page.

## Payments (Stage 4 — verified working)
- Endpoint: POST /api/v1/{TOKEN}/job/addpayment/
  body: { auth_secret, uuid, amount, type, date:"YYYY-MM-DD HH:MM:SS" }
  success -> { flag:true, data:{ paymentId } }. Negative amount = discount/adjustment.
- No delete-payment endpoint found in v1; reverse with an offsetting negative payment.
- Idempotency via workiz_payment_log unique(booking_id, event_key).
- job/update/ exists (POST, needs uuid). job/create, job/delete verified earlier.

## Blocked on v1 (need v2 keys later)
- Call logs & SMS logs: no v1 endpoint exists; v1 keys are rejected by v2 (/crm/api/v2).
  Stage 3 (comms history in CRM) waits until v2 credentials are available.

## v2 API — still blocked (2026-08-04)
- Generated v2 creds: Key ID "KEY-XE2KwLeDPa3yqZMA" + a secret. Tested ~15 auth
  styles (headers, Bearer, Basic, token-exchange endpoints) — ALL return
  401 {"valid":false}, even on non-existent paths. Uniform front-door rejection
  = credentials not authorized on this plan (not a format problem).
- ACTION FOR NOAM: ask Workiz support for the correct v2 auth method + whether
  v2 is enabled on the plan. Until then, line-items + call/SMS logs stay on hold.
- Meanwhile: itemized job notes (buildComment) give a clean priced breakdown as
  a stand-in for real v2 line-items.
