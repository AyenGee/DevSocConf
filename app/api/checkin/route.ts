import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const ticketId = body?.ticketId as string | undefined;
  const deviceNote = (body?.deviceNote as string | undefined) ?? null;

  if (!ticketId) {
    return NextResponse.json({ error: "Missing ticketId." }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase
    .rpc("check_in_ticket", {
      p_ticket_id: ticketId.trim(),
      p_device_note: deviceNote,
    })
    .single();

  if (error) {
    return NextResponse.json({ error: "Check-in failed. Try scanning again." }, { status: 500 });
  }

  const result = data as { result: "ADMIT" | "ALREADY_USED" | "INVALID"; full_name: string | null; checked_in_at: string | null };

  return NextResponse.json(result);
}
