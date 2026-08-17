"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { domainFromWebsite } from "@/lib/company-logo";

/** Live favicon preview — server fetches the real site icon (HTML → fallbacks). */
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
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const trimmed = website.trim();
    if (!trimmed || !domainFromWebsite(trimmed)) {
      setPreviewUrl(null);
      setLoading(false);
      return;
    }

    const ac = new AbortController();
    setLoading(true);

    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ website: trimmed });
        if (label?.trim()) params.set("label", label.trim());
        const res = await fetch(`/api/company/logo/preview?${params}`, {
          signal: ac.signal,
        });
        if (!res.ok) {
          setPreviewUrl(null);
          return;
        }
        const blob = await res.blob();
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
      } catch {
        if (!ac.signal.aborted) setPreviewUrl(null);
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    }, 400);

    return () => {
      clearTimeout(timer);
      ac.abort();
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [website, label]);

  const px = `${size}px`;

  if (loading && !previewUrl) {
    return (
      <span
        className={cn(
          "shrink-0 animate-pulse rounded border border-line bg-surface-subtle",
          className,
        )}
        style={{ width: px, height: px }}
        aria-hidden
      />
    );
  }

  if (!previewUrl) return null;

  return (
    <img
      src={previewUrl}
      alt={label ? `${label} favicon` : "Website favicon"}
      width={size}
      height={size}
      className={cn(
        "shrink-0 rounded border border-line bg-surface-subtle object-contain",
        className,
      )}
      style={{ width: px, height: px }}
    />
  );
}
