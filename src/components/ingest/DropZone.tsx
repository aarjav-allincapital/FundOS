"use client";

import { useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import { cn } from "@/lib/cn";

export function DropZone({
  onFiles,
  busy,
}: {
  onFiles: (files: File[]) => void | Promise<void>;
  busy: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [reading, setReading] = useState(false);
  const disabled = busy || reading;

  async function handleFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    // Keep the input populated until onFiles has copied the bytes. Clearing it
    // first can revoke Safari's access to an otherwise local file.
    setReading(true);
    try {
      await onFiles(Array.from(list));
    } finally {
      setReading(false);
    }
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (!disabled) void handleFiles(e.dataTransfer.files);
      }}
      onClick={() => !disabled && inputRef.current?.click()}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors",
        dragging ? "border-gain bg-gain/5" : "border-line hover:border-line-strong hover:bg-surface-subtle",
        disabled && "pointer-events-none opacity-60"
      )}
    >
      <UploadCloud className="h-6 w-6 text-ink-muted" />
      <div className="text-sm font-semibold text-ink">
        {disabled ? "Reading…" : "Drop files here or click to browse"}
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
        onChange={async (e) => {
          const input = e.currentTarget;
          await handleFiles(input.files);
          // The files are memory-backed now, so clearing is safe and allows
          // selecting the same document again.
          input.value = "";
        }}
      />
    </div>
  );
}
