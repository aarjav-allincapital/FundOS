"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { faviconUrlFromWebsite } from "@/lib/company-logo";

/** Live favicon preview from DuckDuckGo when a website URL is present. */
export function FaviconPreview({
  website,
  label,
  size = 32,
  className,
}: {
  website: string;
  label?: string;
  size?: number;
  className?: string;
}) {
  const faviconUrl = faviconUrlFromWebsite(website);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [faviconUrl]);

  if (!faviconUrl || failed) return null;

  const px = `${size}px`;

  return (
    <img
      src={faviconUrl}
      alt={label ? `${label} favicon` : "Website favicon"}
      width={size}
      height={size}
      className={cn(
        "shrink-0 rounded border border-line bg-surface-subtle object-contain",
        className,
      )}
      style={{ width: px, height: px }}
      onError={() => setFailed(true)}
    />
  );
}
