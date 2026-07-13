import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * Section — anchored dashboard region with a quiet heading. The `id` is the
 * scroll target used by the sidebar and global search.
 */
export function Section({
  id,
  title,
  description,
  action,
  children,
  className,
}: {
  id: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn("scroll-mt-20", className)}>
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {description && (
            <p className="mt-0.5 text-2xs text-ink-faint">{description}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
