"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/Badge";
import { UserMenu } from "@/components/layout/UserMenu";
import type { SaveStatus } from "@/providers/FundOSProvider";

export interface SearchItem {
  id: string;
  label: string;
  sublabel: string;
  kind: string;
  href: string;
}

export function Topbar({
  searchItems,
  asOf,
  saveStatus = "idle",
  onRetrySave,
}: {
  searchItems: SearchItem[];
  asOf: string;
  saveStatus?: SaveStatus;
  onRetrySave?: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return searchItems.slice(0, 8);
    return searchItems
      .filter(
        (it) =>
          it.label.toLowerCase().includes(q) ||
          it.sublabel.toLowerCase().includes(q) ||
          it.kind.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [query, searchItems]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        inputRef.current?.blur();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  function go(item: SearchItem) {
    setOpen(false);
    setQuery("");
    router.push(item.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter" && results[cursor]) {
      go(results[cursor]);
    }
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur">
      <div ref={wrapRef} className="relative min-w-0 flex-1">
        <div
          className={cn(
            "flex h-9 w-full items-center gap-2 rounded border bg-surface-subtle px-3 transition-colors",
            open ? "border-line-strong" : "border-line"
          )}
        >
          <Search className="h-3.5 w-3.5 text-ink-faint" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              setCursor(0);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder="Search companies, lots, deals, founders…"
            className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-faint"
          />
        </div>

        {open && results.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded border border-line bg-surface shadow-pop">
            {!query.trim() && (
              <div className="border-b border-line px-3 py-1.5 text-2xs text-ink-faint">
                Quick search — type to filter
              </div>
            )}
            {results.map((item, i) => (
              <button
                key={item.id}
                onMouseEnter={() => setCursor(i)}
                onClick={() => go(item)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 px-3 py-2 text-left",
                  cursor === i ? "bg-surface-subtle" : "bg-surface"
                )}
              >
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium text-ink">
                    {item.label}
                  </div>
                  <div className="truncate text-2xs text-ink-faint">
                    {item.sublabel}
                  </div>
                </div>
                <Badge tone="outline">{item.kind}</Badge>
              </button>
            ))}
          </div>
        )}
        {open && query && results.length === 0 && (
          <div className="absolute left-0 right-0 top-full z-40 mt-1 rounded border border-line bg-surface px-3 py-3 text-2xs text-ink-faint shadow-pop">
            No matches for “{query}”.
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <div className="hidden sm:flex flex-col items-end leading-tight">
          <span className="text-2xs text-ink-faint">As of</span>
          <span className="tnum text-[13px] font-medium text-ink">{asOf}</span>
        </div>
        <div className="h-6 w-px bg-line" />
        <SaveStatusChip status={saveStatus} onRetry={onRetrySave} />
        <div className="h-6 w-px bg-line" />
        <UserMenu />
      </div>
    </header>
  );
}

function SaveStatusChip({
  status,
  onRetry,
}: {
  status: SaveStatus;
  onRetry?: () => void;
}) {
  const label =
    status === "saving"
      ? "Saving…"
      : status === "saved"
        ? "Saved"
        : status === "error"
          ? "Save failed"
          : "Live";
  const color =
    status === "saving"
      ? "bg-warn"
      : status === "error"
        ? "bg-loss"
        : "bg-gain";
  const text =
    status === "saving"
      ? "text-warn"
      : status === "error"
        ? "text-loss"
        : "text-ink-muted";
  const ping = status === "saving" || status === "idle";
  const title =
    status === "saving"
      ? "Changes are still being saved — wait before refreshing."
      : status === "error"
        ? "Last save did not reach the server. Click to retry."
        : status === "saved"
          ? "All changes saved."
          : "Live — synced with the shared database.";

  const inner = (
    <>
      <span className="relative flex h-2 w-2" aria-hidden>
        {ping && (
          <span
            className={cn(
              "absolute inline-flex h-full w-full animate-live-ping rounded-full",
              color,
            )}
          />
        )}
        <span
          className={cn(
            "relative inline-flex h-2 w-2 rounded-full",
            color,
            status === "idle" &&
              "animate-live-soft shadow-[0_0_6px_rgba(15,123,77,0.55)]",
          )}
        />
      </span>
      <span className={cn("text-2xs", text)}>{label}</span>
    </>
  );

  if (status === "error") {
    return (
      <button
        type="button"
        onClick={onRetry}
        title={title}
        aria-live="polite"
        className="flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-surface-subtle"
      >
        {inner}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5" title={title} aria-live="polite">
      {inner}
    </div>
  );
}
