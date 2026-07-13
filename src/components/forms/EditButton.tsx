"use client";

import { Pencil } from "lucide-react";
import { useState } from "react";
import { EditRecordModal, type EditRecordMode } from "@/components/forms/EditRecordModal";

export function EditButton({
  mode,
  recordId,
  label = "Edit",
}: {
  mode: EditRecordMode;
  recordId: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center rounded border border-line p-1 text-ink-muted transition-colors hover:border-line-strong hover:bg-surface-subtle hover:text-ink"
        title={label}
      >
        <Pencil className="h-3 w-3" />
      </button>
      <EditRecordModal
        open={open}
        onClose={() => setOpen(false)}
        mode={mode}
        recordId={recordId}
      />
    </>
  );
}
