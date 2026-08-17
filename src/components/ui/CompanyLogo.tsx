"use client";

import { useEffect, useState } from "react";
import type { Company } from "@/lib/types";
import { cn } from "@/lib/cn";

function isDuckDuckGoPlaceholder(url: string): boolean {
  return url.includes("icons.duckduckgo.com");
}

/** Company avatar — Supabase logo when available, otherwise abbr badge. */
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
  const rawUrl = company.logo_url;
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setBroken(false);
  }, [rawUrl, company.updated_at]);
  const useImage =
    rawUrl && !isDuckDuckGoPlaceholder(rawUrl) && !broken;

  if (useImage) {
    const src = company.updated_at
      ? `${rawUrl}?v=${encodeURIComponent(company.updated_at)}`
      : rawUrl;
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
        style={{ width: px, height: px }}
        loading="lazy"
        onError={() => setBroken(true)}
      />
    );
  }

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded bg-ink text-[10px] font-bold text-surface",
        className,
      )}
      style={{ minWidth: px, width: px, height: px }}
      title={label}
      aria-hidden
    >
      {company.abbr ?? (label.slice(0, 2).toUpperCase() || "—")}
    </span>
  );
}
