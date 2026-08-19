// scripts/seed-batch1.ts
//
// One-time run: takes your exported Google Sheet (CSV, in original RSVP
// submission order) and:
//   1. Seeds the `registrations` table, preserving row order.
//   2. Splits rows 1-100 into BATCH_1, everything after into BATCH_2
//      (BATCH_2 stays dormant/INVITED until the 24h batch-timer function
//      opens it automatically).
//   3. Sets event_state.batch_1_sent_at = now(), starting the 24h clock.
//   4. Writes scripts/output/batch1-invites.csv — a ready-to-send list of
//      {email, confirm_link} for Batch 1. Nothing is emailed by this
//      system; you send these yourself (individually, or via a mail-merge
//      tool that accepts a CSV — e.g. a Gmail mail-merge add-on, or Google
//      Sheets + Apps Script).
//
// Run with: npm run seed
// (reads REGISTRATION_CSV_PATH from .env — see .env.example)
//
// Expected CSV columns (header row required): email

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import { randomBytes } from "node:crypto";
import { getSupabaseServerClient } from "../lib/supabase";
import { event } from "../lib/brand";

const BATCH_1_SIZE = 100;
const OUTPUT_DIR = path.join(__dirname, "output");

async function main() {
  const csvPath = process.env.REGISTRATION_CSV_PATH ?? "./scripts/registrations.csv";
  const baseUrl = process.env.APP_BASE_URL;

  if (!baseUrl) {
    throw new Error("APP_BASE_URL is not set in .env");
  }

  if (!fs.existsSync(csvPath)) {
    throw new Error(
      `CSV not found at ${csvPath}. Export your Google Sheet as CSV (keep original row order — do not sort) and place it there, or set REGISTRATION_CSV_PATH.`
    );
  }

  const raw = fs.readFileSync(csvPath, "utf-8");
  const rows: { email: string }[] = parse(raw, { columns: true, skip_empty_lines: true });

  if (rows.length === 0) {
    throw new Error("CSV parsed but contains no rows.");
  }

  console.log(`Loaded ${rows.length} registrants from ${csvPath}.`);
  console.log(
    `Batch 1: rows 1-${Math.min(BATCH_1_SIZE, rows.length)} · Batch 2: rows ${
      BATCH_1_SIZE + 1
    }-${rows.length} (${Math.max(0, rows.length - BATCH_1_SIZE)} people)`
  );
  console.log(`Event capacity: ${event.spotsTotal} spots.`);

  const supabase = getSupabaseServerClient();

  // Guard against accidentally re-running this against a live event.
  const { data: existing } = await supabase.from("registrations").select("id").limit(1);
  if (existing && existing.length > 0) {
    throw new Error(
      "registrations table is not empty — refusing to re-seed. This script is meant to run once. " +
        "If you need to re-run for testing, truncate `registrations` and reset `event_state` first."
    );
  }

  const toInsert = rows.map((row, i) => {
    const order = i + 1; // 1-indexed to match "first 100" language throughout the spec
    return {
      sheet_row_order: order,
      batch: order <= BATCH_1_SIZE ? "BATCH_1" : "BATCH_2",
      original_email: row.email.trim(),
      confirm_token: randomBytes(24).toString("hex"),
      // Batch 1 links go live immediately (PENDING); Batch 2 stays
      // dormant (INVITED) until the 24h timer function opens it.
      status: order <= BATCH_1_SIZE ? ("PENDING" as const) : ("INVITED" as const),
    };
  });

  const { error: insertErr } = await supabase.from("registrations").insert(toInsert);
  if (insertErr) {
    throw new Error(`Failed to insert registrations: ${insertErr.message}`);
  }
  console.log(`Inserted ${toInsert.length} registration rows.`);

  const { error: stateErr } = await supabase
    .from("event_state")
    .update({ batch_1_sent_at: new Date().toISOString() })
    .eq("id", 1);

  if (stateErr) {
    throw new Error(`Failed to set batch_1_sent_at: ${stateErr.message}`);
  }

  // Write the CSV you'll actually send from.
  const batch1Rows = toInsert.filter((r) => r.batch === "BATCH_1");
  const csvOut = stringify(
    batch1Rows.map((r) => ({
      email: r.original_email,
      confirm_link: `${baseUrl}/confirm/${r.confirm_token}`,
    })),
    { header: true }
  );

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const outPath = path.join(OUTPUT_DIR, "batch1-invites.csv");
  fs.writeFileSync(outPath, csvOut);

  console.log(`\nWrote ${batch1Rows.length} invite links to ${outPath}`);
  console.log(`24h clock started at ${new Date().toISOString()}.`);
  console.log(
    "Send these links to the Batch 1 emails now (24h deadline). Batch 2 will unlock automatically"
  );
  console.log("after 24h — run `npm run export:batch2` once it does to get their links.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
