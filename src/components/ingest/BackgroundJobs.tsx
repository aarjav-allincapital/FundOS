"use client";

import {
  CheckCircle2,
  Clock,
  Loader2,
  UploadCloud,
  X,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/cn";
import {
  useIngestJobs,
  type IngestJob,
  type IngestJobStatus,
} from "@/providers/IngestJobsProvider";

const STATUS_META: Record<
  IngestJobStatus,
  { label: string; className: string }
> = {
  queued: { label: "Queued", className: "text-ink-faint" },
  extracting: { label: "Extracting…", className: "text-ink-muted" },
  ready: { label: "Ready to review", className: "text-ink" },
  committing: { label: "Committing…", className: "text-ink-muted" },
  committed: { label: "Committed", className: "text-gain" },
  error: { label: "Failed", className: "text-loss" },
};

function StatusIcon({ status }: { status: IngestJobStatus }) {
  if (status === "queued") return <Clock className="h-3.5 w-3.5 text-ink-faint" />;
  if (status === "extracting" || status === "committing")
    return <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-muted" />;
  if (status === "committed")
    return <CheckCircle2 className="h-3.5 w-3.5 text-gain" />;
  if (status === "error") return <XCircle className="h-3.5 w-3.5 text-loss" />;
  return <UploadCloud className="h-3.5 w-3.5 text-ink" />;
}

function jobDetail(job: IngestJob): string {
  if (job.status === "error") return job.error ?? "Failed";
  if (job.status === "committed" && job.summary) {
    const s = job.summary;
    return `${s.companiesCreated} new companies · ${s.lots} lots · ${s.marks} marks`;
  }
  if (job.status === "ready" && job.entities) {
    const e = job.entities;
    const n =
      e.companies.length + e.founders.length + e.lots.length + e.marks.length;
    return job.consumed
      ? "Added to review below"
      : `${n} records found`;
  }
  const kb = job.size ? `${(job.size / 1024).toFixed(0)} KB` : "";
  return kb;
}

export function BackgroundJobs() {
  const { jobs, activeCount, removeJob, clearFinished } = useIngestJobs();
  if (jobs.length === 0) return null;

  const hasFinished = jobs.some(
    (j) => j.status === "committed" || j.status === "error" || j.consumed,
  );

  return (
    <div className="rounded-lg border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <div className="flex items-center gap-2 text-2xs font-semibold text-ink">
          Background jobs
          {activeCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-surface-subtle px-2 py-0.5 text-ink-muted">
              <Loader2 className="h-3 w-3 animate-spin" />
              {activeCount} running
            </span>
          )}
        </div>
        {hasFinished && (
          <button
            type="button"
            onClick={clearFinished}
            className="text-2xs text-ink-faint transition-colors hover:text-ink"
          >
            Clear finished
          </button>
        )}
      </div>
      <ul className="divide-y divide-line">
        {jobs.map((job) => {
          const meta = STATUS_META[job.status];
          return (
            <li
              key={job.id}
              className="flex items-center gap-3 px-3 py-2 text-2xs"
            >
              <StatusIcon status={job.status} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-ink">
                  {job.fileName}
                </div>
                <div className="truncate text-ink-faint">{jobDetail(job)}</div>
              </div>
              <span className={cn("shrink-0 font-medium", meta.className)}>
                {meta.label}
              </span>
              {(job.status === "committed" ||
                job.status === "error" ||
                job.consumed) && (
                <button
                  type="button"
                  onClick={() => removeJob(job.id)}
                  className="shrink-0 text-ink-faint transition-colors hover:text-ink"
                  title="Dismiss"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
