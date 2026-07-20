"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldAlert, Download, History, RotateCcw } from "lucide-react";
import { useAuth } from "@/providers/AuthProvider";
import { isAdminEmail } from "@/lib/audit/admin";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Panel, PanelHeader, PanelBody } from "@/components/ui/Panel";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";

interface AuditRow {
  id: string;
  created_at: string;
  actor_email: string | null;
  action: string;
  status: "ok" | "blocked" | "denied" | "error";
  before_counts: Record<string, number> | null;
  after_counts: Record<string, number> | null;
  details: string | null;
}

interface BackupRow {
  id: string;
  created_at: string;
  reason: string;
  actor_email: string | null;
  counts: Record<string, number> | null;
}

function statusBadgeTone(status: AuditRow["status"]) {
  switch (status) {
    case "ok":
      return "gain" as const;
    case "blocked":
    case "denied":
      return "warn" as const;
    case "error":
      return "loss" as const;
    default:
      return "neutral" as const;
  }
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function countsDelta(before: Record<string, number> | null, after: Record<string, number> | null): string {
  if (!before && !after) return "—";
  const keys = new Set([...(before ? Object.keys(before) : []), ...(after ? Object.keys(after) : [])]);
  const parts: string[] = [];
  for (const key of keys) {
    const b = before?.[key] ?? 0;
    const a = after?.[key] ?? 0;
    if (b !== a) parts.push(`${key} ${b}→${a}`);
  }
  return parts.length > 0 ? parts.join(", ") : "no change";
}

export default function LogsPage() {
  const { email } = useAuth();
  const allowed = isAdminEmail(email);

  const [logs, setLogs] = useState<AuditRow[] | null>(null);
  const [backups, setBackups] = useState<BackupRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [logsRes, backupsRes] = await Promise.all([
        fetch("/api/admin/logs", { cache: "no-store" }),
        fetch("/api/admin/backups", { cache: "no-store" }),
      ]);
      const logsJson = await logsRes.json();
      const backupsJson = await backupsRes.json();
      if (!logsRes.ok || !logsJson.ok) throw new Error(logsJson.error ?? "Failed to load logs");
      if (!backupsRes.ok || !backupsJson.ok) throw new Error(backupsJson.error ?? "Failed to load backups");
      setLogs(logsJson.rows);
      setBackups(backupsJson.rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  const restoreBackup = useCallback(
    async (id: string) => {
      if (!window.confirm(
        "Restore this backup? The current database will be replaced with this snapshot. " +
          "The current data will itself be backed up first, so this can be undone.",
      )) {
        return;
      }
      setBusyId(id);
      setError(null);
      try {
        const res = await fetch(`/api/admin/backups/${id}/restore`, { method: "POST" });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error ?? "Restore failed");
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Restore failed");
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  if (!allowed) {
    return (
      <>
        <PageHeader title="Logs" description="Audit trail and backups." />
        <Panel className="items-center justify-center py-16">
          <div className="flex flex-col items-center gap-2 text-center">
            <ShieldAlert className="h-6 w-6 text-ink-faint" />
            <p className="text-[13px] font-semibold text-ink">Restricted</p>
            <p className="max-w-sm text-2xs text-ink-faint">
              This page is only visible to admin accounts.
            </p>
          </div>
        </Panel>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Logs"
        description="Every write to the database, plus automatic backups taken before each one."
      />

      {error && (
        <div className="mb-4 rounded border border-loss/30 bg-loss/5 px-3 py-2 text-2xs text-loss">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-4">
        <Panel>
          <PanelHeader
            title="Audit log"
            subtitle="Who wrote what, and when"
            icon={<History className="h-4 w-4" />}
            action={
              <a
                href="/api/admin/logs/export"
                className="inline-flex items-center gap-1.5 rounded border border-line-strong bg-surface-subtle px-2.5 py-1.5 text-2xs font-semibold text-ink transition-colors hover:border-ink hover:bg-ink hover:text-surface"
              >
                <Download className="h-3.5 w-3.5" />
                Download CSV
              </a>
            }
          />
          <PanelBody className="p-0">
            {logs === null ? (
              <TableSkeleton rows={6} />
            ) : logs.length === 0 ? (
              <p className="p-4 text-2xs text-ink-faint">No writes logged yet.</p>
            ) : (
              <Table>
                <THead>
                  <TH>When</TH>
                  <TH>Actor</TH>
                  <TH>Action</TH>
                  <TH>Status</TH>
                  <TH>Change</TH>
                  <TH>Details</TH>
                </THead>
                <TBody>
                  {logs.map((row) => (
                    <TR key={row.id}>
                      <TD muted>{formatWhen(row.created_at)}</TD>
                      <TD>{row.actor_email ?? "—"}</TD>
                      <TD>{row.action}</TD>
                      <TD>
                        <Badge tone={statusBadgeTone(row.status)}>{row.status}</Badge>
                      </TD>
                      <TD muted className="max-w-[260px] truncate">
                        <span title={countsDelta(row.before_counts, row.after_counts)}>
                          {countsDelta(row.before_counts, row.after_counts)}
                        </span>
                      </TD>
                      <TD muted className="max-w-[320px] truncate">
                        <span title={row.details ?? undefined}>{row.details ?? "—"}</span>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader
            title="Backups"
            subtitle="Automatic snapshots taken before every database write"
          />
          <PanelBody className="p-0">
            {backups === null ? (
              <TableSkeleton rows={4} />
            ) : backups.length === 0 ? (
              <p className="p-4 text-2xs text-ink-faint">No backups yet.</p>
            ) : (
              <Table>
                <THead>
                  <TH>When</TH>
                  <TH>Reason</TH>
                  <TH>Actor</TH>
                  <TH>Companies</TH>
                  <TH>Lots</TH>
                  <TH>Marks</TH>
                  <TH>Actions</TH>
                </THead>
                <TBody>
                  {backups.map((row) => (
                    <TR key={row.id}>
                      <TD muted>{formatWhen(row.created_at)}</TD>
                      <TD>{row.reason}</TD>
                      <TD muted>{row.actor_email ?? "—"}</TD>
                      <TD num>{row.counts?.companies ?? 0}</TD>
                      <TD num>{row.counts?.investmentLots ?? 0}</TD>
                      <TD num>{row.counts?.valuationMarks ?? 0}</TD>
                      <TD>
                        <div className="flex items-center gap-2">
                          <a
                            href={`/api/admin/backups/${row.id}`}
                            className="inline-flex items-center gap-1 rounded border border-line-strong px-2 py-1 text-2xs font-semibold text-ink hover:border-ink"
                          >
                            <Download className="h-3 w-3" />
                            JSON
                          </a>
                          <button
                            type="button"
                            disabled={busyId === row.id}
                            onClick={() => restoreBackup(row.id)}
                            className={cn(
                              "inline-flex items-center gap-1 rounded border border-line-strong px-2 py-1 text-2xs font-semibold text-ink hover:border-ink",
                              busyId === row.id && "opacity-50",
                            )}
                          >
                            <RotateCcw className="h-3 w-3" />
                            {busyId === row.id ? "Restoring…" : "Restore"}
                          </button>
                        </div>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </PanelBody>
        </Panel>
      </div>
    </>
  );
}
