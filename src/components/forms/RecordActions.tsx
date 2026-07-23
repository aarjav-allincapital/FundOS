"use client";

import { EditButton } from "@/components/forms/EditButton";
import { DeleteButton } from "@/components/forms/DeleteButton";
import type { EditRecordMode } from "@/components/forms/EditRecordModal";
import type { DeleteRecordKind } from "@/lib/data/deletes";
import { useAuth } from "@/providers/AuthProvider";

// Not every editable record is deletable (e.g. a fund is edit-only).
const MODE_TO_KIND: Partial<Record<EditRecordMode, DeleteRecordKind>> = {
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
  const { can } = useAuth();

  // Org users may view lots / marks but cannot edit or delete them.
  if (mode === "lot" && !can("edit_lots")) return null;
  if (mode === "valuation" && !can("edit_valuation_marks")) return null;

  const kind = MODE_TO_KIND[mode];
  return (
    <div className="flex items-center justify-end gap-1">
      <EditButton mode={mode} recordId={recordId} />
      {kind && <DeleteButton kind={kind} recordId={recordId} />}
    </div>
  );
}
