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

/**
 * Result of a remote load. Crucially distinguishes a *confirmed empty* server
 * (the read succeeded and there is genuinely no data yet) from a *failed* read
 * (network error, auth 401, 500). Callers must never treat a failed read as
 * "empty" — doing so risks overwriting a populated database with local/bootstrap
 * data on the next save (a silent, catastrophic wipe).
 */
export type RemoteLoad =
  | { status: "ok"; data: FundOSData; updatedAt: number | null }
  | { status: "empty" }
  | { status: "error" };

/** Load the persisted snapshot, distinguishing empty vs failed reads. */
export async function loadRemoteState(): Promise<RemoteLoad> {
  if (!isSupabaseConfigured()) return { status: "error" };
  try {
    const res = await fetch("/api/state", { cache: "no-store" });
    if (!res.ok) return { status: "error" };
    const json = (await res.json()) as {
      ok: boolean;
      data: FundOSData | null;
      updatedAt: string | null;
    };
    if (!json.ok) return { status: "error" };
    if (!json.data) return { status: "empty" };
    const parsed = json.updatedAt ? Date.parse(json.updatedAt) : NaN;
    return {
      status: "ok",
      data: json.data,
      updatedAt: Number.isFinite(parsed) ? parsed : null,
    };
  } catch (err) {
    console.warn("[FundOS] remote load failed:", err);
    return { status: "error" };
  }
}

export interface SaveResult {
  ok: boolean;
  /** Server updated_at as epoch ms when the save succeeded. */
  updatedAt: number | null;
}

/**
 * Persist the full snapshot. Returns the new server timestamp on success.
 * Pass `force` to override the server's empty-overwrite guard (intentional reset).
 */
export async function saveRemoteState(
  data: FundOSData,
  opts: { force?: boolean } = {},
): Promise<SaveResult> {
  if (!isSupabaseConfigured()) return { ok: false, updatedAt: null };
  try {
    const res = await fetch(`/api/state${opts.force ? "?force=1" : ""}`, {
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
