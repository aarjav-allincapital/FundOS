import type { Company } from "@/lib/types";
import { cn } from "@/lib/cn";

/** Company avatar — logo when available, otherwise abbr badge. */
export function CompanyLogo({
  company,
  size = 24,
  className,
}: {
  company: Pick<Company, "abbr" | "brand_name" | "legal_name" | "logo_url" | "updated_at">;
  size?: number;
  className?: string;
}) {
  const label = company.brand_name ?? company.legal_name;
  const px = `${size}px`;

  if (company.logo_url) {
    const src = company.updated_at
      ? `${company.logo_url}?v=${encodeURIComponent(company.updated_at)}`
      : company.logo_url;
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className={cn(
          "shrink-0 rounded object-contain",
          company.brand_name === "&Done" || company.brand_name === "&done"
            ? "bg-ink"
            : "bg-surface-subtle",
          className,
        )}
        loading="lazy"
      />
    );
  }

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded bg-ink px-1 text-[10px] font-bold text-surface",
        className,
      )}
      style={{ minWidth: px, height: px }}
      title={label}
      aria-hidden
    >
      {company.abbr ?? "—"}
    </span>
  );
}
