import { humanize } from "@/lib/calc/formatters";

/** Display label for enum values in dropdowns (no underscores). */
export function selectLabel(value: string): string {
  return humanize(value);
}

export function SelectOptions({ values }: { values: readonly string[] }) {
  return (
    <>
      {values.map((value) => (
        <option key={value} value={value}>
          {selectLabel(value)}
        </option>
      ))}
    </>
  );
}
