import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * Panel — the base container for every dashboard widget.
 * Flat, hairline-bordered, white. No shadows/gradients by default.
 */
export function Panel({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-col border border-line bg-surface rounded",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

interface PanelHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}

export function PanelHeader({ title, subtitle, action, icon }: PanelHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-line">
      <div className="flex items-center gap-2 min-w-0">
        {icon && <span className="text-ink-faint shrink-0">{icon}</span>}
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold text-ink leading-tight truncate">
            {title}
          </h3>
          {subtitle && (
            <p className="text-2xs text-ink-faint truncate mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function PanelBody({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("p-4", className)} {...props}>
      {children}
    </div>
  );
}
