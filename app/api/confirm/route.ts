import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

const WITS_EMAIL_PATTERN = /@students\.wits\.ac\.za$/i;

// GET is used both on first load of a confirm link AND every time someone
// revisits it later — for a CONFIRMED registration, this is also how their
// ticket_id gets back to the browser so their QR can be re-rendered. There
// is no separate "view my ticket" page; the confirm link IS the ticket.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Missing token." }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();

  const { data: reg, error } = await supabase
    .from("registrations")
    .select("status, batch, full_name, ticket_id")
    .eq("confirm_token", token)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Lookup failed." }, { status: 500 });
  }
  if (!reg) {
    return NextResponse.json({ error: "This confirmation link is not valid." }, { status: 404 });
  }

  const { data: state } = await supabase
    .from("event_state")
    .select("spots_left")
    .eq("id", 1)
    .maybeSingle();

  return NextResponse.json({
    status: reg.status,
    batch: reg.batch,
    fullName: reg.full_name,
    ticketId: reg.ticket_id,
    spotsLeft: state?.spots_left ?? null,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { confirmToken, fullName, studentNumber, witsEmail, attending } = body as {
    confirmToken?: string;
    fullName?: string;
    studentNumber?: string;
    witsEmail?: string;
    attending?: boolean;
  };

  if (!confirmToken) {
    return NextResponse.json({ error: "Missing confirmation link." }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();

  // "Not attending" goes through the decline path, not confirm.
  if (attending === false) {
    const { error } = await supabase.rpc("decline_registration", {
      p_confirm_token: confirmToken,
    });

    if (error) {
      return NextResponse.json({ error: mapDbError(error.message) }, { status: 400 });
    }

    return NextResponse.json({ status: "declined" });
  }

  // Attending = true path: validate the form fields we're about to store.
  if (!fullName?.trim() || !studentNumber?.trim() || !witsEmail?.trim()) {
    return NextResponse.json(
      { error: "Full name, student number, and Wits email are all required." },
      { status: 400 }
    );
  }

  if (!WITS_EMAIL_PATTERN.test(witsEmail.trim())) {
    return NextResponse.json(
      { error: "Please enter your Wits student email address." },
      { status: 400 }
    );
  }

  const { data: reg, error: confirmErr } = await supabase
    .rpc("confirm_registration", {
      p_confirm_token: confirmToken,
      p_full_name: fullName.trim(),
      p_student_number: studentNumber.trim(),
      p_wits_email: witsEmail.trim(),
    })
    .single();

  if (confirmErr) {
    return NextResponse.json({ error: mapDbError(confirmErr.message) }, { status: 400 });
  }

  const registration = reg as { ticket_id: string; full_name: string };

  // No email is sent here. The ticket_id is returned directly so the
  // confirmation page can render the QR immediately, client-side — and
  // the same thing happens again via GET if this link is ever revisited.
  return NextResponse.json({
    status: "confirmed",
    ticketId: registration.ticket_id,
    fullName: registration.full_name,
  });
}

function mapDbError(message: string): string {
  if (message.includes("INVALID_TOKEN")) return "This confirmation link is not valid.";
  if (message.includes("ALREADY_CONFIRMED")) return "You've already confirmed your attendance.";
  if (message.includes("ALREADY_DECLINED")) return "You've already told us you can't make it.";
  if (message.includes("INVITE_EXPIRED")) return "This invitation has expired.";
  if (message.includes("EVENT_FULL")) return "Sorry — all spots for this event have been filled.";
  if (message.includes("ALREADY_RESOLVED")) return "This invitation has already been responded to.";
  return "Something went wrong. Please try again or contact the organizers.";
}
