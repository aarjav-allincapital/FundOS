"use client";

import { useState } from "react";
import { useFundOS } from "@/providers/FundOSProvider";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DropZone } from "@/components/ingest/DropZone";
import { GoogleDrivePicker } from "@/components/ingest/GoogleDrivePicker";
import { ReviewTable } from "@/components/ingest/ReviewTable";
import { ingestFile } from "@/lib/ingest/ingest-file";
import { existingCompanyId, founderAlreadyExists } from "@/lib/ingest/commit";
import type { FundOSData } from "@/lib/types";
import type {
  DraftRecord,
  ExtractedEntities,
  CommitSummary,
  Provenance,
} from "@/lib/ingest/types";
import { emptyEntities } from "@/lib/ingest/types";

let draftSeq = 0;
function nextId(): string {
  draftSeq += 1;
  return `draft-${Date.now()}-${draftSeq}`;
}

function toDrafts(
  entities: ExtractedEntities,
  prov: Provenance,
  current: FundOSData
): DraftRecord[] {
  const out: DraftRecord[] = [];
  // Companies/founders already in FundOS start flagged + unchecked (no need to
  // re-create them). Extracted lots start unchecked so the user picks their own
  // fund's lot from a multi-investor round. Everything else starts checked.
  for (const c of entities.companies) {
    const existing = existingCompanyId(current, c.legal_name) != null;
    out.push({ id: nextId(), kind: "company", data: c, provenance: prov, existing, include: !existing });
  }
  for (const f of entities.founders) {
    const existing = founderAlreadyExists(current, f.company_name, f.name);
    out.push({ id: nextId(), kind: "founder", data: f, provenance: prov, existing, include: !existing });
  }
  for (const l of entities.lots) {
    out.push({ id: nextId(), kind: "lot", data: l, provenance: prov, include: prov.method !== "extraction" });
  }
  for (const m of entities.marks) {
    out.push({ id: nextId(), kind: "mark", data: m, provenance: prov, include: true });
  }
  return out;
}

function fromDrafts(drafts: DraftRecord[]): ExtractedEntities {
  const e = emptyEntities();
  for (const d of drafts) {
    if (!d.include) continue;
    if (d.kind === "company") e.companies.push(d.data as ExtractedEntities["companies"][number]);
    else if (d.kind === "founder") e.founders.push(d.data as ExtractedEntities["founders"][number]);
    else if (d.kind === "lot") e.lots.push(d.data as ExtractedEntities["lots"][number]);
    else e.marks.push(d.data as ExtractedEntities["marks"][number]);
  }
  return e;
}

export default function IngestPage() {
  const { data, commitDrafts } = useFundOS();
  const [drafts, setDrafts] = useState<DraftRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<CommitSummary | null>(null);

  async function handleFiles(files: File[]) {
    setBusy(true);
    setError(null);
    setSummary(null);
    // Read all dropped files in parallel — extraction is I/O-bound (one API
    // call per doc), so N docs take ~1 doc's time instead of N×.
    const results = await Promise.all(
      files.map(async (file) => ({ file, result: await ingestFile(file) }))
    );
    const collected: DraftRecord[] = [];
    const errors: string[] = [];
    for (const { file, result } of results) {
      if (result.ok) {
        const prov: Provenance = { source: file.name, method: result.method };
        const produced = toDrafts(result.entities, prov, data);
        if (produced.length === 0) errors.push(`${file.name}: no records found.`);
        collected.push(...produced);
      } else {
        errors.push(result.error);
      }
    }
    if (collected.length > 0) setDrafts((prev) => [...prev, ...collected]);
    if (errors.length > 0) setError(errors.join(" "));
    setBusy(false);
  }

  async function handleCommit() {
    setCommitting(true);
    setError(null);
    try {
      const result = await commitDrafts(fromDrafts(drafts));
      setSummary(result);
      // Keep only the drafts the user had unticked (not committed).
      setDrafts((prev) => prev.filter((d) => !d.include));
    } catch {
      setError("Commit failed. Your data was not changed.");
    } finally {
      setCommitting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Ingest"
        description="Drop a portfolio sheet (CSV/XLSX) or a deck / term sheet (PDF/image). Records land here as drafts to review before they're committed."
      />

      <div className="flex flex-col gap-4">
        <DropZone onFiles={handleFiles} busy={busy} />
        <GoogleDrivePicker onFiles={handleFiles} busy={busy} />

        {error && (
          <p className="rounded border border-loss/30 bg-loss/5 px-3 py-2 text-2xs text-loss">
            {error}
          </p>
        )}

        {summary && (
          <p className="rounded border border-gain/30 bg-gain/5 px-3 py-2 text-2xs text-ink">
            Committed: <strong>{summary.companiesCreated}</strong> new companies (
            {summary.companiesReused} already existed), <strong>{summary.lots}</strong> lots,{" "}
            <strong>{summary.founders}</strong> founders (
            {summary.foundersReused} already existed), <strong>{summary.marks}</strong> marks
            {summary.skipped > 0 ? ` · ${summary.skipped} skipped` : ""}.
          </p>
        )}

        <ReviewTable
          drafts={drafts}
          committing={committing}
          onToggle={(id, include) =>
            setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, include } : d)))
          }
          onEdit={(id, patch) =>
            setDrafts((prev) =>
              prev.map((d) => (d.id === id ? { ...d, data: { ...(d.data as object), ...patch } } : d))
            )
          }
          onRemove={(id) => setDrafts((prev) => prev.filter((d) => d.id !== id))}
          onCommit={handleCommit}
          onClear={() => {
            setDrafts([]);
            setSummary(null);
            setError(null);
          }}
        />
      </div>
    </>
  );
}
