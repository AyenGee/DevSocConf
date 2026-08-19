// scripts/export-batch2.ts
//
// Run this any time after Batch 1's 24h window has passed (the batch-timer
// Edge Function opens Batch 2 automatically). It writes
// scripts/output/batch2-invites.csv — {email, confirm_link} — for you to
// send manually, along with the current spots-remaining count so you can
// mention it in the email ("X spots left").
//
// Run with: npm run export:batch2
//
// If Batch 2 isn't open yet, this tells you how long is left instead of
// producing an empty file.

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { stringify } from "csv-stringify/sync";
import { getSupabaseServerClient } from "../lib/supabase";

const OUTPUT_DIR = path.join(__dirname, "output");

async function main() {
  const baseUrl = process.env.APP_BASE_URL;
  if (!baseUrl) throw new Error("APP_BASE_URL is not set in .env");

  const supabase = getSupabaseServerClient();

  const { data: state, error: stateErr } = await supabase
    .from("event_state")
    .select("batch_1_sent_at, batch_2_opened, spots_left")
    .eq("id", 1)
    .single();

  if (stateErr || !state) {
    throw new Error(`Could not load event_state: ${stateErr?.message ?? "no row found"}`);
  }

  if (!state.batch_1_sent_at) {
    throw new Error("Batch 1 hasn't been sent yet — run `npm run seed` first.");
  }

  if (!state.batch_2_opened) {
    const sentAt = new Date(state.batch_1_sent_at).getTime();
    const hoursElapsed = (Date.now() - sentAt) / (60 * 60 * 1000);
    const hoursLeft = Math.max(0, 24 - hoursElapsed).toFixed(1);
    console.log(
      `Batch 2 isn't open yet — ${hoursLeft}h remaining on the Batch 1 window (or the scheduled` +
        " batch-timer function hasn't run since it passed — it checks every ~15 min)."
    );
    return;
  }

  const { data: rows, error: rowsErr } = await supabase
    .from("registrations")
    .select("original_email, confirm_token")
    .eq("batch", "BATCH_2")
    .eq("status", "PENDING")
    .order("sheet_row_order", { ascending: true });

  if (rowsErr) throw new Error(`Failed to load Batch 2 rows: ${rowsErr.message}`);

  if (!rows || rows.length === 0) {
    console.log("Batch 2 is open, but there are no rows to export (event may already be full).");
    return;
  }

  const csvOut = stringify(
    rows.map((r) => ({
      email: r.original_email,
      confirm_link: `${baseUrl}/confirm/${r.confirm_token}`,
      spots_left_at_export: state.spots_left,
    })),
    { header: true }
  );

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const outPath = path.join(OUTPUT_DIR, "batch2-invites.csv");
  fs.writeFileSync(outPath, csvOut);

  console.log(`Wrote ${rows.length} Batch 2 invite links to ${outPath}`);
  console.log(`Spots remaining at time of export: ${state.spots_left}`);
  console.log("Mention that number in your email — it's live-capacity-gated, not on a timer,");
  console.log("so the form will simply close once spots run out.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
