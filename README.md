# AI & Beyond Tech Conference 2026 — Ticketing System

Wits Developer Society. Handles: batched waitlist confirmation (100 then everyone else)
and one-time QR ticket check-in. **No automated email, no login/auth anywhere** — sending
invites is a manual step you do yourself; see below for exactly what that involves.

## How it works (recap)

1. You export your Google Form responses as CSV, in original submission order.
2. `npm run seed` loads that CSV, splits rows 1–100 into Batch 1 / the rest into Batch 2,
   and writes `scripts/output/batch1-invites.csv` — a list of `{email, confirm_link}` for
   the first 100 people. **You send these yourself** (see "Sending invites manually" below).
3. A scheduled Supabase Edge Function checks every ~15 minutes. Once 24h have passed since
   Batch 1 was generated, it expires anyone who didn't respond and unlocks Batch 2's links.
4. Once Batch 2 is unlocked, run `npm run export:batch2` to get their CSV — mention the
   live "spots remaining" count in your email, since Batch 2 has no fixed deadline, it just
   closes when the event is full.
5. When someone confirms "Yes, attending," their QR ticket appears **immediately in their
   browser** — no email needed. Their confirmation link permanently doubles as their ticket:
   if they revisit the exact same link later (even days later, even on the day of the
   event), it shows the same QR again.
6. On the day, door staff open `/scan` on any phone (no login) and scan tickets. Each
   ticket can only be admitted once — the check happens atomically in Postgres, so
   simultaneous scans of a shared/screenshotted ticket can't both succeed.

## Sending invites manually

This is the one genuinely manual part of the whole system, twice: once for Batch 1, once
for Batch 2. Both times you'll have a CSV with `email` and `confirm_link` columns. A few
ways to actually send from that:

- **Small batch of 100–150, fastest**: use a mail-merge tool that accepts a CSV — e.g. the
  "Mail Merge for Gmail" (YAMM) Chrome extension, or GMass. Import the CSV, write one
  template email with a `{{confirm_link}}` merge field, send. Each person gets their own
  personalized link in a normal-looking individual email, not a bulk blast.
- **No add-ons**: paste the CSV into a Google Sheet, use Google Sheets + Apps Script to
  loop through rows and call `MailApp.sendEmail()` — a few lines of script, sends from your
  own Gmail, no domain/DNS setup required.
- **Manual, small scale**: just open the CSV and copy-paste each link into an individual
  email. Realistic for testing with a handful of people, not for 100+.

Whichever you use, sending through your own Gmail/Wits email account works fine here —
you don't need a verified sending domain or any email API, because this system was
deliberately built to not depend on one.

## One-time setup

### 1. Supabase project
- Create a project at supabase.com.
- Open the SQL editor and run `supabase/schema.sql` in full.
- Note your project URL and **service role key** (Settings → API) — the service role key
  is powerful, keep it server-side only, never in the Next.js client bundle.

### 2. Environment variables
Copy `.env.example` to `.env` and fill in real values. Also set the same variables as
Edge Function secrets (`supabase secrets set ...`) since the batch-timer function runs
outside the Next.js app — it only needs the Supabase URL and service role key, nothing else.

### 3. Install and run locally
```bash
npm install
npm run dev
```

### 4. Deploy the app
Deploy the Next.js app anywhere that supports it (Vercel is the path of least resistance).
Set `APP_BASE_URL` to the deployed URL — it's what gets embedded in confirmation links
in the exported CSVs, so get this right before you run the seed script.

### 5. Deploy the batch-timer Edge Function
```bash
supabase functions deploy batch-timer
supabase functions schedule create batch-timer --cron "*/15 * * * *"
```

## Running it for the real event

1. **Dry run first.** Make a test CSV with 3–5 email addresses you control, set
   `EVENT_SPOTS_TOTAL` to something tiny like 2, run `npm run seed`, and manually send
   yourself the invite links. Confirm: the confirm link works, the QR appears in-browser,
   revisiting the same link shows the QR again, and `/scan` correctly admits it once and
   rejects a second scan. Reset the database (truncate `registrations`, reset
   `event_state`) once satisfied, and set `EVENT_SPOTS_TOTAL` back to 105.
2. **Export your real list.** Google Form responses → CSV, original submission order, save
   as `scripts/registrations.csv`.
3. **Run `npm run seed`.** This seeds the database and writes
   `scripts/output/batch1-invites.csv`. Send those 100 links manually now — the 24h clock
   starts the moment you run this script, not when you finish sending, so don't leave a
   big gap between the two.
4. **Wait ~24h.** The scheduled function expires non-responders and unlocks Batch 2
   automatically — nothing to do on your end.
5. **Run `npm run export:batch2`** once it's unlocked (or check `scripts/output/` — the
   script tells you how long is left if you run it too early). Send that CSV manually too.
6. **Day of the event**: share the `/scan` URL with door staff. Nothing else needs to be
   running — by now the confirmation window is closed.

## Optional: exporting tickets as a backup

Tickets don't need to be sent at all — see step 5 in "How it works" above. But if you'd
still like a downloadable QR image per person (e.g. to attach in a reminder email closer
to the event), run:
```bash
npm run export:tickets
```
This writes one PNG per confirmed attendee to `scripts/output/tickets/`, plus a CSV
mapping each person to their file and their ticket link.

## What's deliberately not built

Per the spec, this is a single-use, low-stakes, one-day tool: no auth, no admin dashboard,
no manual check-in UI, no automated email of any kind. If your event grows past ~150 people
or becomes recurring, those are the first things worth adding back in.
