import { todayLocalIso } from "@/lib/dates";

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="mb-3 flex flex-col gap-1">
      <span className="text-2xs font-medium uppercase tracking-wide text-ink-faint">
        {label}
      </span>
      {children}
    </label>
  );
}

export const inputClass =
  "rounded border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-line-strong";

/**
 * Date input that cannot be in the future (max = today, local).
 * Past dates are allowed. Defaults to today when no value is provided.
 */
export function DateInput({
  className = inputClass,
  defaultValue,
  max,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  const today = todayLocalIso();
  const raw =
    defaultValue === undefined || defaultValue === ""
      ? today
      : String(defaultValue);
  const resolvedDefault = raw > today ? today : raw;

  return (
    <input
      type="date"
      className={className}
      max={max ?? today}
      defaultValue={props.value === undefined ? resolvedDefault : undefined}
      {...props}
    />
  );
}

export function Submit({
  label = "Save",
  saving = false,
}: {
  label?: string;
  saving?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={saving}
      className="mt-2 w-full rounded bg-ink py-2 text-[13px] font-semibold text-surface hover:bg-ink/90 disabled:opacity-50"
    >
      {saving ? "Saving…" : label}
    </button>
  );
}
