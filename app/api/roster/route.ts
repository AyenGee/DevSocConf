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
// spotsTotal) come from dedicated exact-count queries against
// registrations/event_state/scan_attempts — NOT derived from the
// attendees list below. This is deliberate: the list only shows rows
// that have a student_number to display, but the counts must always
// reflect the true totals regardless of that. Keeping them as separate
// queries means a display quirk in the list can never again silently
// throw off the numbers at the top of the page.
export async function GET() {
  const supabase = getSupabaseServerClient();

  // Counted directly off registrations (not the v_event_summary view) so
  // there's no dependency on the view's definition staying in sync with
  // the table in whatever environment this is running against.
  const { count: confirmedCount, error: confirmedErr } = await supabase
    .from("registrations")
    .select("id", { count: "exact", head: true })
    .eq("status", "CONFIRMED");

  if (confirmedErr) {
    return NextResponse.json({ error: "Could not load confirmed count." }, { status: 500 });
  }

  const { data: state, error: stateErr } = await supabase
    .from("event_state")
    .select("spots_total")
    .eq("id", 1)
    .maybeSingle();

  if (stateErr) {
    return NextResponse.json({ error: "Could not load event state." }, { status: 500 });
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
      confirmedCount: confirmedCount ?? 0,
      checkedInCount: checkedInCount ?? 0,
      spotsTotal: state?.spots_total ?? null,
      attendees,
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}