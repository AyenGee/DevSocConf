// scripts/export-tickets.ts
//
// OPTIONAL. Tickets don't need to be emailed at all — the moment someone
// confirms, their confirmation link permanently doubles as their ticket:
// visiting /confirm/[token] again shows their QR code, no email required.
//
// This script exists only as a backup/convenience if you'd rather manually
// send people their QR as an attachment too. It writes one PNG per
// confirmed attendee into scripts/output/tickets/, plus a CSV mapping
// email -> filename -> ticket link, for a mail-merge tool that supports
// attachments.
//
// Run with: npm run export:tickets

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { stringify } from "csv-stringify/sync";
import { getSupabaseServerClient } from "../lib/supabase";
import { generateTicketQrPngBuffer } from "../lib/qr";

const OUTPUT_DIR = path.join(__dirname, "output", "tickets");

async function main() {
  const baseUrl = process.env.APP_BASE_URL;
  if (!baseUrl) throw new Error("APP_BASE_URL is not set in .env");

  const supabase = getSupabaseServerClient();

  const { data: rows, error } = await supabase
    .from("registrations")
    .select("full_name, wits_email, ticket_id, confirm_token")
    .eq("status", "CONFIRMED")
    .order("sheet_row_order", { ascending: true });

  if (error) throw new Error(`Failed to load confirmed registrations: ${error.message}`);
  if (!rows || rows.length === 0) {
    console.log("No confirmed registrations yet.");
    return;
  }

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const csvRows: Record<string, string>[] = [];

  for (const r of rows) {
    if (!r.ticket_id || !r.wits_email) continue;
    const buffer = await generateTicketQrPngBuffer(r.ticket_id);
    const filename = `${r.ticket_id}.png`;
    fs.writeFileSync(path.join(OUTPUT_DIR, filename), buffer);
    csvRows.push({
      full_name: r.full_name ?? "",
      email: r.wits_email,
      ticket_id: r.ticket_id,
      qr_file: `tickets/${filename}`,
      ticket_link: `${baseUrl}/confirm/${r.confirm_token}`,
    });
  }

  const csvOut = stringify(csvRows, { header: true });
  fs.writeFileSync(path.join(OUTPUT_DIR, "..", "tickets.csv"), csvOut);

  console.log(`Wrote ${csvRows.length} QR PNGs to ${OUTPUT_DIR}`);
  console.log(`Wrote scripts/output/tickets.csv mapping each person to their file + ticket link.`);
  console.log("Remember: this is optional. Everyone can already view their own QR by revisiting");
  console.log("the exact confirm link they used — no email required.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
