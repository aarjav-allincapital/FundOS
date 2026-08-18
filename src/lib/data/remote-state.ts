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
 * `keepalive: true` lets a fetch outlive page unload, but browsers cap the
 * request body at 64 KB. The FundOS snapshot routinely approaches/exceeds that,
 * so keepalive must NOT be used for normal saves — a body over the cap is
 * silently rejected, dropping the edit (e.g. a newly added company vanishing on
 * refresh). We keep a conservative threshold below 64 KB for the rare unload
 * backstop and fall back to a synchronous request for larger payloads.
 */
const KEEPALIVE_MAX_BYTES = 58 * 1024;

/**
 * Persist the full snapshot. Returns the new server timestamp on success.
 * Pass `force` to override the server's empty-overwrite guard (intentional reset).
 * `keepalive` is opt-in and only safe for small bodies (see KEEPALIVE_MAX_BYTES).
 */
export async function saveRemoteState(
  data: FundOSData,
  opts: { force?: boolean; keepalive?: boolean } = {},
): Promise<SaveResult> {
  if (!isSupabaseConfigured()) return { ok: false, updatedAt: null };
  try {
    const res = await fetch(`/api/state${opts.force ? "?force=1" : ""}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      ...(opts.keepalive ? { keepalive: true } : {}),
    });
    if (!res.ok) return { ok: false, updatedAt: null };
    const json = (await res.json().catch(() => null)) as
      | { ok?: boolean; updatedAt?: string }
      | null;
    if (json && json.ok === false) return { ok: false, updatedAt: null };
    const parsed = json?.updatedAt ? Date.parse(json.updatedAt) : NaN;
    return { ok: true, updatedAt: Number.isFinite(parsed) ? parsed : null };
  } catch (err) {
    console.warn("[FundOS] remote save failed:", err);
    return { ok: false, updatedAt: null };
  }
}

/**
 * Best-effort synchronous save for the page-unload backstop ONLY. Synchronous
 * XHR still runs during `beforeunload`/`pagehide` and — unlike `keepalive` —
 * has no 64 KB body cap, so a large last-moment edit isn't lost on refresh.
 */
function saveRemoteStateSync(data: FundOSData): boolean {
  if (!isSupabaseConfigured()) return false;
  try {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", "/api/state", false); // synchronous
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.send(JSON.stringify(data));
    return xhr.status >= 200 && xhr.status < 300;
  } catch (err) {
    console.warn("[FundOS] sync unload save failed:", err);
    return false;
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

  // Normal (async) flush — NO keepalive, so there is no 64 KB body cap and a
  // large snapshot always persists.
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
    /** Async flush for SPA unmounts / manual flushes (no keepalive). */
    flushNow() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      flush();
    },
    /**
     * Unload backstop for `pagehide`/`beforeunload`. Uses `keepalive` when the
     * body fits under the 64 KB cap; otherwise a synchronous request, which has
     * no cap and still completes during unload. Prevents a last-second edit
     * (e.g. a just-added company) from being lost on refresh.
     */
    flushOnUnload() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (!pending) return;
      const snapshot = pending;
      pending = null;
      const bytes =
        typeof TextEncoder !== "undefined"
          ? new TextEncoder().encode(JSON.stringify(snapshot)).length
          : JSON.stringify(snapshot).length;
      if (bytes <= KEEPALIVE_MAX_BYTES) {
        void saveRemoteState(snapshot, { keepalive: true }).then((result) =>
          onSaved?.(result),
        );
      } else {
        const ok = saveRemoteStateSync(snapshot);
        onSaved?.({ ok, updatedAt: ok ? Date.now() : null });
      }
    },
  };
}
