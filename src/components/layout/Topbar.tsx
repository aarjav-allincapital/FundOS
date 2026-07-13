"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/Badge";

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
}: {
  searchItems: SearchItem[];
  asOf: string;
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
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-gain" />
          <span className="text-2xs text-ink-muted">Live</span>
        </div>
      </div>
    </header>
  );
}
