import { AddButton, type AddRecordMode } from "@/components/forms/AddRecordModal";

export function PageHeader({
  title,
  description,
  addMode,
  addLabel = "Add",
}: {
  title: string;
  description?: string;
  addMode?: AddRecordMode;
  addLabel?: string;
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-base font-semibold text-ink">{title}</h1>
        {description && (
          <p className="mt-0.5 text-2xs text-ink-faint">{description}</p>
        )}
      </div>
      {addMode && <AddButton mode={addMode} label={addLabel} />}
    </div>
  );
}
