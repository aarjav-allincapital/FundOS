"use client";

import { useCallback, useEffect, useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar, type SearchItem } from "@/components/layout/Topbar";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { AddRecordModal } from "@/components/forms/AddRecordModal";
import { useFundOS } from "@/providers/FundOSProvider";
import { buildSearchIndex } from "@/lib/search";
import { formatDate } from "@/lib/calc";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { data, isLoading } = useFundOS();
  const [recordModalOpen, setRecordModalOpen] = useState(false);
  const searchItems: SearchItem[] = buildSearchIndex(data);

  const openRecordModal = useCallback(() => setRecordModalOpen(true), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openRecordModal();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openRecordModal]);

  const asOf =
    data.positionSnapshots
      .map((s) => s.snapshot_date)
      .sort()
      .reverse()[0] ?? new Date().toISOString().slice(0, 10);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-surface-sunken">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar searchItems={searchItems} asOf={formatDate(asOf, "medium")} />
        <main className="flex-1 overflow-hidden">
          <div className="mx-auto h-full max-w-[1600px] overflow-y-auto px-4 py-5 lg:px-6">
            {isLoading ? <PageSkeleton /> : children}
          </div>
        </main>
      </div>
      <AddRecordModal
        open={recordModalOpen}
        onClose={() => setRecordModalOpen(false)}
      />
    </div>
  );
}
