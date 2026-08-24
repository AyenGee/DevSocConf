import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Deliberately returns student_number + checked-in status ONLY — never
// full_name, wits_email, or ticket_id. This endpoint has no auth (see
// spec), so it's designed to be safe to expose publicly: a student number
// alone isn't enough to identify someone to a casual visitor the way a
// full name would be, while still being useful for door-side lookup.
export async function GET() {
  const supabase = getSupabaseServerClient();

  const { data: rows, error } = await supabase
    .from("registrations")
    .select("student_number, checked_in_at")
    .eq("status", "CONFIRMED")
    .order("student_number", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Could not load roster." }, { status: 500 });
  }

  const { data: state } = await supabase
    .from("event_state")
    .select("spots_total")
    .eq("id", 1)
    .maybeSingle();

  const totalConfirmed = rows?.length ?? 0;

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

  const missingStudentNumber = totalConfirmed - attendees.length;

  return NextResponse.json(
    {
      confirmedCount: totalConfirmed,
      checkedInCount: (rows ?? []).filter((r) => r.checked_in_at !== null).length,
      spotsTotal: state?.spots_total ?? null,
      missingStudentNumber,
      attendees,
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}