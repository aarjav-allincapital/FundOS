"use client";

import type { FundOSData } from "@/lib/types";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Client persistence for the FundOS snapshot. All traffic goes through the
 * server route (/api/state), which uses the service_role key — the browser
 * never writes to Supabase directly (anon is read-only by RLS).
 */

export interface RemoteState {
  data: FundOSData | null;
  /** Server-side updated_at as epoch ms, or null when absent. */
  updatedAt: number | null;
}

/** Load the persisted snapshot + its server timestamp. */
export async function loadRemoteState(): Promise<RemoteState | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const res = await fetch("/api/state", { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      ok: boolean;
      data: FundOSData | null;
      updatedAt: string | null;
    };
    if (!json.ok) return null;
    const parsed = json.updatedAt ? Date.parse(json.updatedAt) : NaN;
    return {
      data: json.data,
      updatedAt: Number.isFinite(parsed) ? parsed : null,
    };
  } catch (err) {
    console.warn("[FundOS] remote load failed:", err);
    return null;
  }
}

export interface SaveResult {
  ok: boolean;
  /** Server updated_at as epoch ms when the save succeeded. */
  updatedAt: number | null;
}

/** Persist the full snapshot. Returns the new server timestamp on success. */
export async function saveRemoteState(data: FundOSData): Promise<SaveResult> {
  if (!isSupabaseConfigured()) return { ok: false, updatedAt: null };
  try {
    const res = await fetch("/api/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      // Allow the request to complete even if the page is unloading.
      keepalive: true,
    });
    if (!res.ok) return { ok: false, updatedAt: null };
    const json = (await res.json().catch(() => null)) as
      | { ok: boolean; updatedAt?: string }
      | null;
    const parsed = json?.updatedAt ? Date.parse(json.updatedAt) : NaN;
    return { ok: true, updatedAt: Number.isFinite(parsed) ? parsed : null };
  } catch (err) {
    console.warn("[FundOS] remote save failed:", err);
    return { ok: false, updatedAt: null };
  }
}

/**
 * Fire-and-forget debounced saver — coalesces rapid mutations into one PUT.
 * `onSaved` reports the server timestamp so the caller can track sync state.
 */
export function createDebouncedRemoteSaver(
  onSaved?: (result: SaveResult) => void,
  delayMs = 800,
) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: FundOSData | null = null;

  const flush = () => {
    if (!pending) return;
    const snapshot = pending;
    pending = null;
    void saveRemoteState(snapshot).then((result) => onSaved?.(result));
  };

  return {
    schedule(data: FundOSData) {
      pending = data;
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, delayMs);
    },
    flushNow() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      flush();
    },
  };
}
