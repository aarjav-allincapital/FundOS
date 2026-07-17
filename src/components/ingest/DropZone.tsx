"use client";

import { useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import { cn } from "@/lib/cn";

export function DropZone({
  onFiles,
  busy,
}: {
  onFiles: (files: File[]) => void;
  busy: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    onFiles(Array.from(list));
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!busy) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (!busy) handleFiles(e.dataTransfer.files);
      }}
      onClick={() => !busy && inputRef.current?.click()}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors",
        dragging ? "border-gain bg-gain/5" : "border-line hover:border-line-strong hover:bg-surface-subtle",
        busy && "pointer-events-none opacity-60"
      )}
    >
      <UploadCloud className="h-6 w-6 text-ink-muted" />
      <div className="text-sm font-semibold text-ink">
        {busy ? "Reading…" : "Drop files here or click to browse"}
      </div>
      <div className="text-2xs text-ink-faint">
        CSV / XLSX for bulk import · PDF / DOCX / image for AI extraction
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".csv,.xlsx,.xlsm,.xls,.docx,application/pdf,image/*"
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
