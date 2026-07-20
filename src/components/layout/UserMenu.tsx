"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LogOut, Settings } from "lucide-react";
import { useAuth } from "@/providers/AuthProvider";

export function UserMenu() {
  const { email, profile, authEnabled, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  if (!authEnabled) return null;

  const label = profile.fullName || email || "Account";
  const initials =
    label
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join("") || "?";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-2xs font-semibold text-surface transition-opacity hover:opacity-90"
        aria-label="Account menu"
      >
        {initials}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 w-56 overflow-hidden rounded border border-line bg-surface shadow-pop">
          <div className="border-b border-line px-3 py-2.5">
            <div className="truncate text-[13px] font-medium text-ink">
              {profile.fullName || "Team member"}
            </div>
            <div className="truncate text-2xs text-ink-faint">{email}</div>
            {profile.title && (
              <div className="mt-0.5 truncate text-2xs text-ink-muted">
                {profile.title}
              </div>
            )}
          </div>
          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-[13px] text-ink transition-colors hover:bg-surface-subtle"
          >
            <Settings className="h-3.5 w-3.5 text-ink-faint" />
            Profile & settings
          </Link>
          <button
            onClick={() => {
              setOpen(false);
              void signOut();
            }}
            className="flex w-full items-center gap-2 border-t border-line px-3 py-2 text-left text-[13px] text-ink transition-colors hover:bg-surface-subtle"
          >
            <LogOut className="h-3.5 w-3.5 text-ink-faint" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
