import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

// Backed by the v_event_summary view defined in supabase/schema.sql.
// No auth on this endpoint by design (see spec) — it only exposes
// aggregate counts, no personal data.
export async function GET() {
  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase.from("v_event_summary").select("*").single();

  if (error) {
    return NextResponse.json({ error: "Could not load summary." }, { status: 500 });
  }

  return NextResponse.json(data);
}
