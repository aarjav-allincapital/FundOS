"use client";

/**
 * Background ingestion service.
 *
 * Files dropped for ingest or import are enqueued here and processed one at a
 * time OFF the render path, so the user can keep navigating while decks/sheets
 * extract (the slow LLM/OCR step). Each job moves through:
 *
 *   reading → queued → extracting → ready        (needs review; entities held on the job)
 *   reading → queued → extracting → committing → committed   (autoCommit deterministic imports)
 *   … → error
 *
 * The queue lives at app scope (mounted under FundOSProvider) so it survives
 * client-side navigation between pages. File objects can't be serialized, so the
 * queue is in-memory for the session; only status/summary metadata is surfaced.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ingestFile, snapshotIngestFile } from "@/lib/ingest/ingest-file";
import { useFundOS } from "@/providers/FundOSProvider";
import type {
  CommitSummary,
  ExtractedEntities,
  Provenance,
} from "@/lib/ingest/types";

export type IngestJobStatus =
  | "reading"
  | "queued"
  | "extracting"
  | "ready"
  | "committing"
  | "committed"
  | "error";

export interface IngestJob {
  id: string;
  fileName: string;
  size: number;
  status: IngestJobStatus;
  method?: Provenance["method"];
  /** Present once extraction finished and the job awaits review. */
  entities?: ExtractedEntities;
  /** Present after an auto-committed job lands. */
  summary?: CommitSummary;
  error?: string;
  /** True once a review consumer has pulled the entities into its draft list. */
  consumed?: boolean;
  autoCommit: boolean;
  createdAt: number;
  updatedAt: number;
}

interface IngestJobsContextValue {
  jobs: IngestJob[];
  activeCount: number;
  enqueue: (files: File[], opts?: { autoCommit?: boolean }) => Promise<void>;
  removeJob: (id: string) => void;
  clearFinished: () => void;
  /** Mark a "ready" job as pulled into a review queue (won't be offered again). */
  markConsumed: (id: string) => void;
}

const IngestJobsContext = createContext<IngestJobsContextValue | null>(null);

let jobSeq = 0;
function nextJobId(): string {
  jobSeq += 1;
  return `job-${Date.now()}-${jobSeq}`;
}

export function IngestJobsProvider({ children }: { children: React.ReactNode }) {
  const { commitDrafts } = useFundOS();
  const [jobs, setJobs] = useState<IngestJob[]>([]);

  // File objects are held out of state (not serializable / not renderable).
  const filesRef = useRef<Map<string, File>>(new Map());
  // Per-job autoCommit flag, kept in a ref alongside the file.
  const jobsAutoCommitRef = useRef<Map<string, boolean>>(new Map());
  const queueRef = useRef<string[]>([]);
  const runningRef = useRef(false);
  // Keep the latest committer without retriggering the worker on every data edit.
  const commitRef = useRef(commitDrafts);
  useEffect(() => {
    commitRef.current = commitDrafts;
  }, [commitDrafts]);

  const patchJob = useCallback((id: string, patch: Partial<IngestJob>) => {
    setJobs((prev) =>
      prev.map((j) =>
        j.id === id ? { ...j, ...patch, updatedAt: Date.now() } : j,
      ),
    );
  }, []);

  const drainQueue = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      while (queueRef.current.length > 0) {
        const id = queueRef.current.shift()!;
        const file = filesRef.current.get(id);
        if (!file) continue;

        patchJob(id, { status: "extracting" });
        let result: Awaited<ReturnType<typeof ingestFile>>;
        try {
          result = await ingestFile(file);
        } catch (err) {
          const detail = err instanceof Error ? err.message : "unexpected error";
          patchJob(id, { status: "error", error: `Ingest failed: ${detail}` });
          filesRef.current.delete(id);
          continue;
        }

        if (!result.ok) {
          patchJob(id, { status: "error", error: result.error });
          filesRef.current.delete(id);
          continue;
        }

        const autoCommit = jobsAutoCommitRef.current.get(id) ?? false;

        if (!autoCommit) {
          patchJob(id, {
            status: "ready",
            method: result.method,
            entities: result.entities,
          });
          filesRef.current.delete(id);
          continue;
        }

        // Deterministic imports (CSV/XLSX or trusted JSON) commit straight away.
        patchJob(id, { status: "committing", method: result.method });
        try {
          const summary = await commitRef.current(result.entities);
          patchJob(id, { status: "committed", summary });
        } catch (err) {
          const detail =
            err instanceof Error ? err.message : "commit failed";
          patchJob(id, { status: "error", error: detail });
        }
        filesRef.current.delete(id);
      }
    } finally {
      runningRef.current = false;
      // A concurrent enqueue can finish snapshotting just as this worker sees
      // an empty queue. Schedule another drain so that file cannot get stuck.
      if (queueRef.current.length > 0) {
        queueMicrotask(() => void drainQueue());
      }
    }
  }, [patchJob]);

  const enqueue = useCallback(
    async (files: File[], opts?: { autoCommit?: boolean }) => {
      if (files.length === 0) return;
      const autoCommit = opts?.autoCommit ?? false;
      const now = Date.now();
      const pending = files.map((file) => {
        const id = nextJobId();
        jobsAutoCommitRef.current.set(id, autoCommit);
        const job: IngestJob = {
          id,
          fileName: file.name,
          size: file.size,
          status: "reading",
          autoCommit,
          createdAt: now,
          updatedAt: now,
        };
        return { id, file, job };
      });

      setJobs((prev) => [...pending.map(({ job }) => job), ...prev]);

      // Materialize every selected file immediately and concurrently while the
      // input/DataTransfer still owns a valid Safari file handle. Only stable,
      // memory-backed File objects enter the slower extraction queue.
      await Promise.all(
        pending.map(async ({ id, file }) => {
          try {
            const stableFile = await snapshotIngestFile(file);
            filesRef.current.set(id, stableFile);
            queueRef.current.push(id);
            patchJob(id, { status: "queued" });
          } catch (err) {
            const detail =
              err instanceof Error ? err.message : "The browser could not read the file.";
            jobsAutoCommitRef.current.delete(id);
            patchJob(id, { status: "error", error: `Ingest failed: ${detail}` });
          }
        }),
      );

      void drainQueue();
    },
    [drainQueue, patchJob],
  );

  const removeJob = useCallback((id: string) => {
    filesRef.current.delete(id);
    jobsAutoCommitRef.current.delete(id);
    setJobs((prev) => prev.filter((j) => j.id !== id));
  }, []);

  const clearFinished = useCallback(() => {
    setJobs((prev) =>
      prev.filter(
        (j) =>
          j.status !== "committed" &&
          j.status !== "error" &&
          !(j.status === "ready" && j.consumed),
      ),
    );
  }, []);

  const markConsumed = useCallback((id: string) => {
    setJobs((prev) =>
      prev.map((j) => (j.id === id ? { ...j, consumed: true } : j)),
    );
  }, []);

  const activeCount = useMemo(
    () =>
      jobs.filter(
        (j) =>
          j.status === "reading" ||
          j.status === "queued" ||
          j.status === "extracting" ||
          j.status === "committing",
      ).length,
    [jobs],
  );

  const value = useMemo<IngestJobsContextValue>(
    () => ({ jobs, activeCount, enqueue, removeJob, clearFinished, markConsumed }),
    [jobs, activeCount, enqueue, removeJob, clearFinished, markConsumed],
  );

  return (
    <IngestJobsContext.Provider value={value}>
      {children}
    </IngestJobsContext.Provider>
  );
}

export function useIngestJobs(): IngestJobsContextValue {
  const ctx = useContext(IngestJobsContext);
  if (!ctx)
    throw new Error("useIngestJobs must be used within IngestJobsProvider");
  return ctx;
}
