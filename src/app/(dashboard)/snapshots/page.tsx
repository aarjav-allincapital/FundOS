"use client";

import { useFundOS } from "@/providers/FundOSProvider";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { SnapshotsAndLogs } from "@/components/dashboard/SnapshotsAndLogs";
import { AddButton } from "@/components/forms/AddRecordModal";

export default function SnapshotsPage() {
  const { data } = useFundOS();
  return (
    <>
      <PageHeader
        title="Snapshots & Logs"
        description="Position snapshots, valuation events and activity history."
      />
      <div className="mb-4 flex gap-2">
        <AddButton mode="valuation" label="Add Valuation Mark" />
      </div>
      <SnapshotsAndLogs data={data} />
    </>
  );
}
