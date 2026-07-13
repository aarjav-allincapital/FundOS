"use client";

import { EditButton } from "@/components/forms/EditButton";
import { DeleteButton } from "@/components/forms/DeleteButton";
import type { EditRecordMode } from "@/components/forms/EditRecordModal";
import type { DeleteRecordKind } from "@/lib/data/deletes";

const MODE_TO_KIND: Record<EditRecordMode, DeleteRecordKind> = {
  company: "company",
  founder: "founder",
  deal: "deal",
  lot: "lot",
  valuation: "valuation",
  snapshot: "snapshot",
  fx: "fx",
};

export function RecordActions({
  mode,
  recordId,
}: {
  mode: EditRecordMode;
  recordId: string;
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      <EditButton mode={mode} recordId={recordId} />
      <DeleteButton kind={MODE_TO_KIND[mode]} recordId={recordId} />
    </div>
  );
}
