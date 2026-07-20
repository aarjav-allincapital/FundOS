"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/config";

let client: SupabaseClient | null = null;

/**
 * Browser Supabase client with cookie-backed auth sessions (via @supabase/ssr).
 * Used for the login/OTP flow, reading the current user, and realtime.
 */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();
  if (!url || !key) return null;
  if (!client) {
    client = createBrowserClient(url, key);
  }
  return client;
}
