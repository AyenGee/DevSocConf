// scripts/add-guest-list.ts
//
// For people organizers have explicitly vouched for — no verification
// needed. Reads scripts/guest-list.csv (columns: full_name, email),
// inserts each one directly as an already-CONFIRMED registration
// (skipping the whole invite → confirm-form flow entirely), generates
// their ticket_id, decrements spots_left by however many are added, and
// writes scripts/output/guest-tickets.csv with their ticket links —
// ready to send manually, same as every other link in this system.
//
// PREREQUISITE: run step1-add-guest-batch-type.sql and
// step2-relax-email-constraint.sql in the Supabase SQL Editor first —
// this script will fail without them.
//
// Run with: npx tsx scripts/add-guest-list.ts

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import { randomBytes } from "node:crypto";
import { getSupabaseServerClient } from "../lib/supabase";

const OUTPUT_DIR = path.join(__dirname, "output");

async function main() {
  const csvPath = path.join(__dirname, "guest-list.csv");
  const baseUrl = process.env.APP_BASE_URL;

  if (!baseUrl) throw new Error("APP_BASE_URL is not set in .env");
  if (!fs.existsSync(csvPath)) {
    throw new Error(`Expected scripts/guest-list.csv (columns: full_name, email) — not found.`);
  }

  const raw = fs.readFileSync(csvPath, "utf-8");
  const rows: { full_name: string; email: string }[] = parse(raw, {
    columns: true,
    skip_empty_lines: true,
  });

  if (rows.length === 0) {
    throw new Error("guest-list.csv parsed but contains no rows.");
  }

  console.log(`Loaded ${rows.length} guest(s) from guest-list.csv.`);

  const supabase = getSupabaseServerClient();

  // Claim spots atomically-ish: check current spots_left first, then
  // decrement by exactly how many we're inserting. Small one-off admin
  // action, not live public traffic, so a simple check-then-update is
  // acceptable here (unlike the public confirm flow, which uses a real
  // atomic function for exactly this reason).
  const { data: state, error: stateErr } = await supabase
    .from("event_state")
    .select("spots_left")
    .eq("id", 1)
    .single();

  if (stateErr || !state) {
    throw new Error(`Could not load event_state: ${stateErr?.message ?? "no row found"}`);
  }

  if (state.spots_left < rows.length) {
    throw new Error(
      `Only ${state.spots_left} spots left, but trying to add ${rows.length} guests. Aborting — no changes made.`
    );
  }

  const toInsert = rows.map((row) => ({
    // sheet_row_order has no real meaning for guests — using a distinct
    // negative-ish range keeps them visually separate from the main list
    // if you ever eyeball sheet_row_order in the table.
    sheet_row_order: 100000 + Math.floor(Math.random() * 100000),
    batch: "GUEST" as const,
    original_email: row.email.trim(),
    confirm_token: randomBytes(24).toString("hex"),
    status: "CONFIRMED" as const,
    full_name: row.full_name.trim(),
    wits_email: row.email.trim(),
    ticket_id: "TKT_" + randomBytes(8).toString("hex"),
    responded_at: new Date().toISOString(),
  }));

  const { error: insertErr } = await supabase.from("registrations").insert(toInsert);
  if (insertErr) {
    throw new Error(`Failed to insert guest registrations: ${insertErr.message}`);
  }

  const { error: updateErr } = await supabase
    .from("event_state")
    .update({ spots_left: state.spots_left - toInsert.length, updated_at: new Date().toISOString() })
    .eq("id", 1);

  if (updateErr) {
    console.error(
      `WARNING: guests were inserted but spots_left was NOT decremented (${updateErr.message}). ` +
        `Fix this manually in Supabase — spots_left should be ${state.spots_left - toInsert.length}.`
    );
  }

  const csvOut = stringify(
    toInsert.map((r) => ({
      full_name: r.full_name,
      email: r.wits_email,
      ticket_link: `${baseUrl}/confirm/${r.confirm_token}`,
    })),
    { header: true }
  );

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const outPath = path.join(OUTPUT_DIR, "guest-tickets.csv");
  fs.writeFileSync(outPath, csvOut);

  console.log(`\nInserted ${toInsert.length} guest(s) as CONFIRMED. Spots left: ${state.spots_left - toInsert.length}.`);
  console.log(`Wrote ticket links to ${outPath} — send these manually, same as any other link.`);
  console.log(`Each link, when opened, shows that person's QR code directly (they're already confirmed).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
