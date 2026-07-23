"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { NAV } from "@/components/layout/nav";
import {
  loadSidebarCollapsed,
  saveSidebarCollapsed,
} from "@/lib/data/storage";
import { useAuth } from "@/providers/AuthProvider";

export function Sidebar() {
  const pathname = usePathname();
  const { isAdmin } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setCollapsed(loadSidebarCollapsed());
    setMounted(true);
  }, []);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    saveSidebarCollapsed(next);
  }

  const width = collapsed ? "w-[60px]" : "w-56";

  return (
    <aside
      className={cn(
        "hidden shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-200 ease-out lg:flex",
        width
      )}
    >
      <div
        className={cn(
          "flex h-14 items-center border-b border-line",
          collapsed ? "justify-center px-2" : "gap-2 px-4"
        )}
      >
        <Image
          src="/all-in-logo.png"
          alt="All In Capital"
          width={collapsed ? 28 : 72}
          height={28}
          className="h-7 w-auto shrink-0 object-contain"
          priority
        />
        {!collapsed && (
          <div className="min-w-0 leading-tight">
            <div className="text-2xs text-ink-faint">FundOS</div>
          </div>
        )}
      </div>

      <div className="border-b border-line p-2">
        <button
          type="button"
          onClick={toggle}
          className={cn(
            "flex w-full items-center rounded border border-line-strong bg-surface-subtle px-2 py-1.5 text-2xs font-semibold text-ink transition-colors hover:border-ink hover:bg-ink hover:text-surface",
            collapsed ? "justify-center" : "gap-2"
          )}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {mounted && collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4" />
              {!collapsed && <span>Collapse</span>}
            </>
          )}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-3">
        {NAV.map((group) => {
          const items = group.items.filter((item) => !item.adminOnly || isAdmin);
          if (items.length === 0) return null;
          return (
          <div key={group.label} className="mb-4">
            {!collapsed && (
              <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                {group.label}
              </div>
            )}
            <ul className="space-y-0.5">
              {items.map((item) => {
                const Icon = item.icon;
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                return (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        "group flex items-center rounded px-2 py-1.5 text-[13px] transition-colors",
                        collapsed ? "justify-center" : "gap-2.5",
                        isActive
                          ? "bg-surface-sunken font-semibold text-ink"
                          : "text-ink-muted hover:bg-surface-subtle hover:text-ink"
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-4 w-4 shrink-0",
                          isActive ? "text-ink" : "text-ink-faint group-hover:text-ink-muted"
                        )}
                        strokeWidth={2}
                      />
                      {!collapsed && item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
          );
        })}
      </nav>
    </aside>
  );
}
