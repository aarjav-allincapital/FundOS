"use client";

import { useRef, useState } from "react";
import { Download, FileJson, FileSpreadsheet, Upload } from "lucide-react";
import { useFundOS } from "@/providers/FundOSProvider";
import { useAuth } from "@/providers/AuthProvider";
import { useIngestJobs } from "@/providers/IngestJobsProvider";
import { BackgroundJobs } from "@/components/ingest/BackgroundJobs";
import {
  EXPORT_ENTITIES,
  downloadDataExcel,
  downloadDataJson,
  downloadEntityCsv,
  type ExportEntityKey,
} from "@/lib/data/export";
import { parseImportFile } from "@/lib/data/import-data";

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-line bg-surface p-4">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      <p className="mt-0.5 text-2xs text-ink-faint">{description}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

const btn =
  "inline-flex items-center gap-1.5 rounded border border-line bg-surface px-3 py-1.5 text-2xs font-semibold text-ink transition-colors hover:border-line-strong hover:bg-surface-subtle";

export function ImportExportPanel() {
  const { data, importData } = useFundOS();
  const { can } = useAuth();
  const { enqueue } = useIngestJobs();
  const canImport = can("ingest");

  const [csvKey, setCsvKey] = useState<ExportEntityKey>("investmentLots");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  async function handleImport(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setNotice(null);

    const spreadsheetJobs: File[] = [];
    for (const file of Array.from(files)) {
      const parsed = await parseImportFile(file);
      if (parsed.kind === "error") {
        setError(parsed.error);
        continue;
      }
      if (parsed.kind === "full") {
        const total = Object.values(parsed.counts).reduce((a, b) => a + b, 0);
        const ok = window.confirm(
          `Replace ALL current data with the contents of "${file.name}"?\n\n` +
            `This backup has ${parsed.counts.companies} companies, ` +
            `${parsed.counts.investmentLots} lots and ${total} records total. ` +
            `Your current dataset will be overwritten. This cannot be undone.`,
        );
        if (!ok) continue;
        try {
          importData(parsed.data);
          setNotice(`Imported full backup from "${file.name}".`);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Import failed.");
        }
        continue;
      }
      // Deterministic rows (CSV / Excel / entities JSON) → background auto-commit.
      spreadsheetJobs.push(file);
    }

    if (spreadsheetJobs.length > 0) {
      enqueue(spreadsheetJobs, { autoCommit: true });
      setNotice(
        `${spreadsheetJobs.length} file(s) queued — importing in the background. Progress shows below.`,
      );
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {notice && (
        <p className="rounded border border-gain/30 bg-gain/5 px-3 py-2 text-2xs text-ink">
          {notice}
        </p>
      )}
      {error && (
        <p className="rounded border border-loss/30 bg-loss/5 px-3 py-2 text-2xs text-loss">
          {error}
        </p>
      )}

      <Section
        title="Export"
        description="Download the full portfolio dataset. JSON round-trips back through Import; Excel/CSV are for analysis in a spreadsheet."
      >
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={btn}
            onClick={() => downloadDataJson(data)}
          >
            <FileJson className="h-3.5 w-3.5" /> Full JSON backup
          </button>
          <button
            type="button"
            className={btn}
            onClick={() => downloadDataExcel(data)}
          >
            <FileSpreadsheet className="h-3.5 w-3.5" /> Excel workbook
          </button>
          <span className="mx-1 h-4 w-px bg-line" />
          <select
            value={csvKey}
            onChange={(e) => setCsvKey(e.target.value as ExportEntityKey)}
            className="rounded border border-line bg-surface px-2 py-1.5 text-2xs text-ink outline-none focus:border-line-strong"
          >
            {EXPORT_ENTITIES.map((e) => (
              <option key={e.key} value={e.key}>
                {e.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={btn}
            onClick={() => downloadEntityCsv(data, csvKey)}
          >
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
        </div>
      </Section>

      <Section
        title="Import"
        description="Restore a full JSON backup (replaces everything), or bulk-import companies & lots from CSV / Excel. Spreadsheet rows are de-duplicated against existing companies before they're committed."
      >
        {canImport ? (
          <>
            <input
              ref={importRef}
              type="file"
              multiple
              accept=".json,.csv,.xlsx,.xlsm,.xls"
              className="hidden"
              onChange={(e) => {
                void handleImport(e.target.files);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              className={btn}
              onClick={() => importRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5" /> Choose files (JSON / CSV / Excel)
            </button>
          </>
        ) : (
          <p className="text-2xs text-ink-faint">
            Importing requires admin access.
          </p>
        )}
      </Section>

      <BackgroundJobs />
    </div>
  );
}
