import { createClient } from "@supabase/supabase-js";

// Service-role client — full DB access, server-side only. Never import
// this file from a "use client" component; it will throw if the service
// key is missing, which is intentional (fail loud, not silent).
export function getSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables."
    );
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
    // Force every request this client makes to bypass any HTTP-level
    // caching (Vercel's fetch Data Cache, intermediate proxies, etc).
    // The roster endpoint needs a true live read on every call.
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
}
