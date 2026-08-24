import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Deliberately returns student_number + checked-in status ONLY — never
// full_name, wits_email, or ticket_id. This endpoint has no auth (see
// spec), so it's designed to be safe to expose publicly: a student number
// alone isn't enough to identify someone to a casual visitor the way a
// full name would be, while still being useful for door-side lookup.
//
// IMPORTANT: the headline counts (confirmedCount, checkedInCount,
// spotsTotal) are pulled directly from v_event_summary and scan_attempts —
// NOT derived from the attendees list below. This is deliberate: the list
// only shows rows that have a student_number to display, but the counts
// must always reflect the true totals regardless of that. Keeping them
// as separate queries means a display quirk in the list can never again
// silently throw off the numbers at the top of the page.
export async function GET() {
  const supabase = getSupabaseServerClient();

  const { data: summary, error: summaryErr } = await supabase
    .from("v_event_summary")
    .select("spots_total, confirmed_count")
    .single();

  if (summaryErr) {
    return NextResponse.json({ error: "Could not load event summary." }, { status: 500 });
  }

  const { count: checkedInCount, error: scanErr } = await supabase
    .from("scan_attempts")
    .select("id", { count: "exact", head: true })
    .eq("result", "ADMIT");

  if (scanErr) {
    return NextResponse.json({ error: "Could not load scan attempts." }, { status: 500 });
  }

  const { data: rows, error: rowsErr } = await supabase
    .from("registrations")
    .select("student_number, checked_in_at")
    .eq("status", "CONFIRMED")
    .order("student_number", { ascending: true });

  if (rowsErr) {
    return NextResponse.json({ error: "Could not load roster list." }, { status: 500 });
  }

  const attendees = (rows ?? [])
    .filter((r) => !!r.student_number)
    .map((r) => ({
      studentNumber: r.student_number as string,
      checkedIn: r.checked_in_at !== null,
    }))
    // Checked-in first, then alphabetical/numeric within each group.
    .sort((a, b) => {
      if (a.checkedIn !== b.checkedIn) return a.checkedIn ? -1 : 1;
      return a.studentNumber.localeCompare(b.studentNumber);
    });

  return NextResponse.json(
    {
      confirmedCount: summary.confirmed_count,
      checkedInCount: checkedInCount ?? 0,
      spotsTotal: summary.spots_total,
      attendees,
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}