"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { FundOSData } from "@/lib/types";
import { createBootstrapData } from "@/lib/data/bootstrap";
import {
  STORAGE_KEY,
  getLocalUpdatedAt,
  loadFundOSData,
  saveFundOSData,
  setLocalUpdatedAt,
  touchLocalUpdatedAt,
} from "@/lib/data/storage";
import {
  createDebouncedRemoteSaver,
  loadRemoteState,
  saveRemoteState,
} from "@/lib/data/remote-state";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  addCompany as mutateCompany,
  addDeal as mutateDeal,
  addFounder as mutateFounder,
  addFxRate as mutateFxRate,
  addInvestmentLot,
  addPositionSnapshot,
  addValuationMark as mutateValuationMark,
  exitLot as mutateExitLot,
  mergeInvestmentLots,
  type AddCompanyInput,
  type AddDealInput,
  type AddFounderInput,
  type AddFxRateInput,
  type AddLotInput,
  type AddSnapshotInput,
  type AddValuationMarkInput,
  type ExitLotInput,
} from "@/lib/data/mutations";
import {
  resolveReportingFx,
  resolveReportingFxMap,
  resolveTransactionFx,
} from "@/lib/fx/prepare";
import {
  updateCompany as patchCompany,
  updateDeal as patchDeal,
  updateFund as patchFund,
  updateFounder as patchFounder,
  updateFxRate as patchFxRate,
  updateInvestmentLot as patchLot,
  updatePositionSnapshot as patchSnapshot,
  updateValuationMark as patchValuationMark,
  type UpdateCompanyInput,
  type UpdateDealInput,
  type UpdateFounderInput,
  type UpdateFundInput,
  type UpdateFxRateInput,
  type UpdateLotInput,
  type UpdateSnapshotInput,
  type UpdateValuationMarkInput,
} from "@/lib/data/updates";
import { deleteRecord as removeRecord, type DeleteRecordKind } from "@/lib/data/deletes";
import { refreshDisplayFxRates } from "@/lib/fx/refresh-display-fx";
import { applyEntities } from "@/lib/ingest/commit";
import type { CommitSummary, ExtractedEntities } from "@/lib/ingest/types";

interface FundOSContextValue {
  data: FundOSData;
  isLoading: boolean;
  isHydrated: boolean;
  addCompany: (input: AddCompanyInput) => void;
  addFounder: (input: AddFounderInput) => void;
  addLot: (input: AddLotInput) => Promise<void>;
  addValuationMark: (input: AddValuationMarkInput) => Promise<void>;
  addSnapshot: (input: AddSnapshotInput) => Promise<void>;
  addDeal: (input: AddDealInput) => void;
  addFxRate: (input: AddFxRateInput) => void;
  exitLot: (input: ExitLotInput) => Promise<void>;
  updateCompany: (input: UpdateCompanyInput) => void;
  updateFounder: (input: UpdateFounderInput) => void;
  updateFund: (input: UpdateFundInput) => void;
  updateLot: (input: UpdateLotInput) => void;
  mergeLots: (lotIds: string[]) => void;
  updateValuationMark: (input: UpdateValuationMarkInput) => void;
  updateSnapshot: (input: UpdateSnapshotInput) => void;
  updateDeal: (input: UpdateDealInput) => void;
  updateFxRate: (input: UpdateFxRateInput) => void;
  deleteRecord: (kind: DeleteRecordKind, id: string) => void;
  commitDrafts: (entities: ExtractedEntities) => Promise<CommitSummary>;
  refreshDisplayFx: () => Promise<void>;
  resetData: () => void;
}

const FundOSContext = createContext<FundOSContextValue | null>(null);

/**
 * True when a snapshot holds real portfolio data (not just the structural
 * bootstrap of fund brand + fund vehicles). Used to decide whether local data
 * is worth seeding into an empty remote — we must never seed a bare bootstrap
 * over a database another teammate may already have populated.
 */
function hasMeaningfulData(d: FundOSData): boolean {
  return d.companies.length > 0 || d.investmentLots.length > 0;
}

export function FundOSProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<FundOSData>(createBootstrapData);
  const dataRef = useRef(data);
  const [isLoading, setIsLoading] = useState(true);
  const [isHydrated, setIsHydrated] = useState(false);
  const canPersistRemote = useRef(false);
  // Last server timestamp we've seen (ms); used to detect teammate changes.
  const remoteTsRef = useRef<number>(0);
  // True while we have a local edit that hasn't been confirmed saved to the DB,
  // so background syncs won't clobber an in-flight change.
  const dirtyRef = useRef(false);

  const remoteSaver = useRef(
    createDebouncedRemoteSaver((result) => {
      if (result.ok) {
        if (result.updatedAt != null) {
          remoteTsRef.current = result.updatedAt;
          setLocalUpdatedAt(result.updatedAt);
        }
        dirtyRef.current = false;
      }
    }),
  );

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  /** Persist locally always; mirror to Supabase (debounced) once hydrated. */
  const persist = useCallback((next: FundOSData) => {
    saveFundOSData(next);
    touchLocalUpdatedAt();
    if (canPersistRemote.current) {
      dirtyRef.current = true;
      remoteSaver.current.schedule(next);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      setIsLoading(true);
      const local = loadFundOSData();

      // The Supabase snapshot is the single source of truth for the whole org.
      // When it exists we adopt it unconditionally so every browser shows the
      // same data — this is what stops a stale local cache (e.g. old seed data)
      // from lingering in one browser. Local is only a fallback when the DB is
      // confirmed empty or the read failed (offline / transient auth).
      let chosen = local;
      let remoteHasData = false;
      let remoteConfirmedEmpty = false;
      let remoteReadFailed = false;

      if (isSupabaseConfigured()) {
        const remote = await loadRemoteState();
        if (remote.status === "ok") {
          remoteHasData = true;
          chosen = remote.data;
          remoteTsRef.current = remote.updatedAt ?? Date.now();
        } else if (remote.status === "empty") {
          remoteConfirmedEmpty = true;
        } else {
          // status === "error": read failed — keep local in memory as a
          // read-only fallback for display. We must NOT persist anything back
          // (this is a possibly stale/incomplete browser cache) until a
          // subsequent sync confirms the real remote state — otherwise a
          // transient network hiccup silently wipes the shared database.
          remoteReadFailed = true;
        }
      }

      if (cancelled) return;

      setData(chosen);
      saveFundOSData(chosen);
      setLocalUpdatedAt(remoteHasData ? remoteTsRef.current : getLocalUpdatedAt() ?? 0);
      canPersistRemote.current = !remoteReadFailed;

      // Seed the DB ONLY when the server explicitly confirmed it is empty AND we
      // actually have real local data to seed. A failed read (status "error")
      // must never trigger a write — that is exactly how a transient hiccup used
      // to overwrite a populated database with an empty bootstrap.
      if (
        isSupabaseConfigured() &&
        remoteConfirmedEmpty &&
        hasMeaningfulData(chosen)
      ) {
        dirtyRef.current = true;
        remoteSaver.current.schedule(chosen);
      }

      setIsLoading(false);
      setIsHydrated(true);

      refreshDisplayFxRates(chosen).then((next) => {
        if (cancelled || next === chosen) return;
        setData(next);
        persist(next);
      });
    }

    hydrate();
    return () => {
      cancelled = true;
    };
  }, [persist]);

  // Cross-tab sync: when another tab writes the snapshot, adopt it in memory
  // without re-persisting (the originating tab already handled remote save).
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      try {
        const next = JSON.parse(e.newValue) as FundOSData;
        setData(next);
      } catch {
        /* ignore malformed cross-tab payloads */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  /**
   * Pull the shared snapshot and adopt it when the server has a different
   * version than we last saw (a teammate saved). Skipped while we have an
   * unsaved local edit in flight, so we never clobber the user's own change.
   */
  const syncFromRemote = useCallback(async () => {
    if (!isSupabaseConfigured() || dirtyRef.current) return;
    try {
      const remote = await loadRemoteState();
      // Only adopt a successful, populated read. "empty"/"error" are ignored so
      // a transient failure never blanks the in-memory data a user is viewing.
      if (remote.status !== "ok" || remote.updatedAt == null) return;
      // A confirmed-good read proves we now hold the authoritative snapshot,
      // so it's safe to allow persisting again (recovers from the read-only
      // fallback mode entered when the initial hydrate's remote read failed).
      canPersistRemote.current = true;
      if (remote.updatedAt !== remoteTsRef.current) {
        remoteTsRef.current = remote.updatedAt;
        const next = remote.data;
        setData(next);
        saveFundOSData(next);
        setLocalUpdatedAt(remote.updatedAt);
      }
    } catch {
      /* transient — the next focus/poll will retry */
    }
  }, []);

  // Live-feeling sync WITHOUT Supabase Realtime (no persistent connection, so
  // it's cheaper on Supabase). We refetch the shared snapshot on the moments a
  // user would actually notice staleness — tab focus / becoming visible — plus
  // a slow background interval as a safety net. Adoption is newer-wins only.
  useEffect(() => {
    if (!isHydrated || !isSupabaseConfigured()) return;

    const onFocus = () => {
      if (document.visibilityState === "visible") void syncFromRemote();
    };

    // Refetch immediately on mount so a freshly opened tab is current.
    void syncFromRemote();

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") void syncFromRemote();
    }, 20_000);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      clearInterval(poll);
    };
  }, [isHydrated, syncFromRemote]);

  // Flush any pending debounced save before the tab is hidden/closed so the
  // very last edit always reaches Supabase.
  useEffect(() => {
    const saver = remoteSaver.current;
    const flush = () => saver.flushNow();
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
      saver.flushNow();
    };
  }, []);

  const commit = useCallback(
    (updater: (prev: FundOSData) => FundOSData) => {
      setData((prev) => {
        const next = updater(prev);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const refreshDisplayFx = useCallback(async () => {
    const snapshot = dataRef.current;
    const next = await refreshDisplayFxRates(snapshot);
    if (next === snapshot) return;
    commit(() => next);
  }, [commit]);

  const value = useMemo<FundOSContextValue>(
    () => ({
      data,
      isLoading,
      isHydrated,
      addCompany: (input) => commit((prev) => mutateCompany(prev, input)),
      addFounder: (input) => commit((prev) => mutateFounder(prev, input)),
      addLot: async (input) => {
        const snapshot = dataRef.current;
        const fx = await resolveTransactionFx(snapshot, input);
        commit((prev) =>
          addInvestmentLot(prev, { ...input, fx_rate_at_entry: fx })
        );
      },
      addValuationMark: async (input) => {
        const snapshot = dataRef.current;
        const company = snapshot.companies.find((c) => c.id === input.company_id);
        if (!company) return;

        const fundCurrencies = snapshot.investmentLots
          .filter(
            (l) => l.company_id === input.company_id && l.status === "active"
          )
          .map((l) => snapshot.funds.find((f) => f.id === l.fund_id)!.currency);

        const reporting_fx = await resolveReportingFxMap(
          snapshot,
          company.operating_currency,
          input.valuation_date,
          fundCurrencies
        );

        commit((prev) =>
          mutateValuationMark(prev, { ...input, reporting_fx })
        );
      },
      addSnapshot: async (input) => {
        const snapshot = dataRef.current;
        const lot = snapshot.investmentLots.find((l) => l.id === input.lot_id);
        if (!lot) return;
        const fund = snapshot.funds.find((f) => f.id === lot.fund_id);
        if (!fund) return;

        const reporting_fx_rate = await resolveReportingFx(
          snapshot,
          lot.currency,
          fund.currency,
          input.snapshot_date
        );

        commit((prev) =>
          addPositionSnapshot(prev, { ...input, reporting_fx_rate })
        );
      },
      addDeal: (input) => commit((prev) => mutateDeal(prev, input)),
      addFxRate: (input) => commit((prev) => mutateFxRate(prev, input)),
      exitLot: async (input) => {
        const snapshot = dataRef.current;
        const lot = snapshot.investmentLots.find((l) => l.id === input.lot_id);
        if (!lot) return;
        const fund = snapshot.funds.find((f) => f.id === lot.fund_id);
        if (!fund) return;

        let fx_rate = input.fx_rate;
        if (
          fx_rate == null &&
          input.event_type !== "write_off" &&
          lot.currency !== fund.currency
        ) {
          fx_rate = await resolveReportingFx(
            snapshot,
            lot.currency,
            fund.currency,
            input.realization_date
          );
        }

        commit((prev) => mutateExitLot(prev, { ...input, fx_rate }));
      },
      updateCompany: (input) => commit((prev) => patchCompany(prev, input)),
      updateFounder: (input) => commit((prev) => patchFounder(prev, input)),
      updateFund: (input) => commit((prev) => patchFund(prev, input)),
      updateLot: (input) => commit((prev) => patchLot(prev, input)),
      mergeLots: (lotIds) => commit((prev) => mergeInvestmentLots(prev, lotIds)),
      updateValuationMark: (input) =>
        commit((prev) => patchValuationMark(prev, input)),
      updateSnapshot: (input) => commit((prev) => patchSnapshot(prev, input)),
      updateDeal: (input) => commit((prev) => patchDeal(prev, input)),
      updateFxRate: (input) => commit((prev) => patchFxRate(prev, input)),
      deleteRecord: (kind, id) =>
        commit((prev) => removeRecord(prev, kind, id)),
      commitDrafts: async (entities) => {
        // Reuse the same live-FX resolvers the manual add flows use, so
        // imported lots/marks get correct entry and reporting FX. Nothing here
        // writes FundOSData directly — applyEntities drives the mutation layer.
        const snapshot = dataRef.current;
        const { data: next, summary } = await applyEntities(snapshot, entities, {
          resolveTransactionFx,
          resolveReportingFxMap,
        });
        commit(() => next);
        return summary;
      },
      refreshDisplayFx,
      resetData: () => {
        const bootstrap = createBootstrapData();
        setData(bootstrap);
        saveFundOSData(bootstrap);
        touchLocalUpdatedAt();
        // Intentional wipe → force past the server's empty-overwrite guard.
        if (canPersistRemote.current) {
          dirtyRef.current = true;
          void saveRemoteState(bootstrap, { force: true }).then((result) => {
            if (result.ok) {
              if (result.updatedAt != null) {
                remoteTsRef.current = result.updatedAt;
                setLocalUpdatedAt(result.updatedAt);
              }
              dirtyRef.current = false;
            }
          });
        }
      },
    }),
    [data, isLoading, isHydrated, commit, refreshDisplayFx, persist]
  );

  return (
    <FundOSContext.Provider value={value}>{children}</FundOSContext.Provider>
  );
}

export function useFundOS(): FundOSContextValue {
  const ctx = useContext(FundOSContext);
  if (!ctx) throw new Error("useFundOS must be used within FundOSProvider");
  return ctx;
}
