import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * Elegant, dense data table primitives. Right-align numeric columns and use
 * tabular figures via the `num` prop.
 */

export function Table({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full border-collapse text-[13px]", className)}>
        {children}
      </table>
    </div>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="border-b border-line">
      <tr>{children}</tr>
    </thead>
  );
}

export function TH({
  children,
  num = false,
  className,
  width,
}: {
  children?: React.ReactNode;
  num?: boolean;
  className?: string;
  width?: string;
}) {
  return (
    <th
      style={width ? { width } : undefined}
      className={cn(
        "px-3 py-2 text-2xs font-semibold uppercase tracking-wide text-ink-faint whitespace-nowrap",
        num ? "text-right" : "text-left",
        className
      )}
    >
      {children}
    </th>
  );
}

export function TBody({ children }: { children: React.ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function TR({
  children,
  className,
  onClick,
  interactive = false,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  interactive?: boolean;
}) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        "border-b border-line/70 last:border-0",
        (interactive || onClick) && "hover:bg-surface-subtle cursor-pointer transition-colors",
        className
      )}
    >
      {children}
    </tr>
  );
}

export function TD({
  children,
  num = false,
  strong = false,
  muted = false,
  className,
}: {
  children?: React.ReactNode;
  num?: boolean;
  strong?: boolean;
  muted?: boolean;
  className?: string;
}) {
  return (
    <td
      className={cn(
        "px-3 py-2 align-middle whitespace-nowrap",
        num && "text-right tnum",
        strong && "font-semibold text-ink",
        muted && "text-ink-muted",
        !strong && !muted && "text-ink",
        className
      )}
    >
      {children}
    </td>
  );
}
