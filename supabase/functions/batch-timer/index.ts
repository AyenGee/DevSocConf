// supabase/functions/batch-timer/index.ts
//
// Purpose: runs on a schedule (e.g. every 10-15 minutes via Supabase's
// Edge Function scheduler) and does two things:
//   1. Once 24h have passed since Batch 1 was sent, expires any Batch 1
//      registration still sitting at INVITED/PENDING (they never responded).
//   2. In that same run, "opens" Batch 2 — flips their confirmation links
//      live and marks event_state.batch_2_opened = true, exactly once.
//
// IMPORTANT: this function does NOT send any email. Sending is manual —
// once Batch 2 is opened, run `npm run export:batch2` locally to get a
// CSV of {email, confirm_link, spots_left} and send those yourself.
//
// This runs one global 24h clock anchored to event_state.batch_1_sent_at,
// matching the spec: Batch 1 was sent all at once, so it expires all at
// once too.
//
// Deploy: supabase functions deploy batch-timer
// Schedule: supabase functions schedule create batch-timer --cron "*/15 * * * *"

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

Deno.serve(async () => {
  const { data: state, error: stateErr } = await supabase
    .from("event_state")
    .select("*")
    .eq("id", 1)
    .single();

  if (stateErr || !state) {
    return jsonResponse({ error: "Could not load event_state" }, 500);
  }

  if (!state.batch_1_sent_at) {
    // Batch 1 links haven't been generated/sent yet — nothing to do until
    // you run `npm run seed` locally.
    return jsonResponse({ status: "waiting_for_batch_1" });
  }

  const sentAt = new Date(state.batch_1_sent_at).getTime();
  const deadlinePassed = Date.now() - sentAt >= TWENTY_FOUR_HOURS_MS;

  if (!deadlinePassed) {
    const hoursLeft = ((TWENTY_FOUR_HOURS_MS - (Date.now() - sentAt)) / (60 * 60 * 1000)).toFixed(1);
    return jsonResponse({ status: "batch_1_still_within_24h", hours_remaining: hoursLeft });
  }

  // --- Step 1: expire any Batch 1 row that never responded ---
  const { data: expired, error: expireErr } = await supabase
    .from("registrations")
    .update({ status: "EXPIRED" })
    .eq("batch", "BATCH_1")
    .in("status", ["INVITED", "PENDING"])
    .select("id");

  if (expireErr) {
    return jsonResponse({ error: `Failed to expire Batch 1 rows: ${expireErr.message}` }, 500);
  }

  // --- Step 2: open Batch 2, exactly once ---
  if (state.batch_2_opened) {
    return jsonResponse({
      status: "batch_1_expired_batch_2_already_opened",
      expired_count: expired?.length ?? 0,
    });
  }

  const { data: refreshedState } = await supabase
    .from("event_state")
    .select("spots_left")
    .eq("id", 1)
    .single();

  if (!refreshedState || refreshedState.spots_left <= 0) {
    // Batch 1 alone filled the event — with the current 100/105 split this
    // shouldn't happen, but guard it anyway rather than opening dead invites.
    await supabase.from("event_state").update({ batch_2_opened: true }).eq("id", 1);
    return jsonResponse({ status: "event_full_before_batch_2", expired_count: expired?.length ?? 0 });
  }

  // "Opening" Batch 2 just means their confirmation links become live
  // (PENDING) instead of dormant (INVITED). No email is sent here — that
  // happens manually, after you run the export script below.
  const { data: opened, error: openErr } = await supabase
    .from("registrations")
    .update({ status: "PENDING" })
    .eq("batch", "BATCH_2")
    .eq("status", "INVITED")
    .select("id");

  if (openErr) {
    return jsonResponse({ error: `Failed to open Batch 2 rows: ${openErr.message}` }, 500);
  }

  await supabase.from("event_state").update({ batch_2_opened: true }).eq("id", 1);

  return jsonResponse({
    status: "batch_2_opened",
    expired_count: expired?.length ?? 0,
    batch_2_opened_count: opened?.length ?? 0,
    spots_left: refreshedState.spots_left,
    next_step: "Run `npm run export:batch2` locally to get the CSV of links to send manually.",
  });
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
