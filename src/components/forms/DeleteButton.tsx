"use client";

import { Trash2 } from "lucide-react";
import { useFundOS } from "@/providers/FundOSProvider";
import type { DeleteRecordKind } from "@/lib/data/deletes";

const LABELS: Record<DeleteRecordKind, string> = {
  company: "company",
  founder: "founder",
  deal: "deal",
  lot: "investment lot",
  valuation: "valuation mark",
  snapshot: "snapshot",
  fx: "FX rate",
};

export function DeleteButton({
  kind,
  recordId,
  label,
}: {
  kind: DeleteRecordKind;
  recordId: string;
  label?: string;
}) {
  const ctx = useFundOS();
  const noun = label ?? LABELS[kind];

  return (
    <button
      type="button"
      onClick={() => {
        if (
          !window.confirm(
            `Delete this ${noun}? This cannot be undone.`
          )
        ) {
          return;
        }
        ctx.deleteRecord(kind, recordId);
      }}
      className="inline-flex items-center justify-center rounded border border-line p-1 text-ink-muted transition-colors hover:border-loss/40 hover:bg-loss/5 hover:text-loss"
      title={`Delete ${noun}`}
    >
      <Trash2 className="h-3 w-3" />
    </button>
  );
}
