"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { FundOSData } from "@/lib/types";
import { createBootstrapData } from "@/lib/data/bootstrap";
import { loadFundOSData, saveFundOSData } from "@/lib/data/storage";
import {
  addCompany as mutateCompany,
  addDeal as mutateDeal,
  addFounder as mutateFounder,
  addFxRate as mutateFxRate,
  addInvestmentLot,
  addPositionSnapshot,
  addValuationMark as mutateValuationMark,
  exitLot as mutateExitLot,
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
  updateValuationMark: (input: UpdateValuationMarkInput) => void;
  updateSnapshot: (input: UpdateSnapshotInput) => void;
  updateDeal: (input: UpdateDealInput) => void;
  updateFxRate: (input: UpdateFxRateInput) => void;
  deleteRecord: (kind: DeleteRecordKind, id: string) => void;
  refreshDisplayFx: () => Promise<void>;
  resetData: () => void;
}

const FundOSContext = createContext<FundOSContextValue | null>(null);

export function FundOSProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<FundOSData>(createBootstrapData);
  const dataRef = useRef(data);
  const [isLoading, setIsLoading] = useState(true);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    const loaded = loadFundOSData();
    setData(loaded);
    setIsLoading(false);
    setIsHydrated(true);
    refreshDisplayFxRates(loaded).then((next) => {
      if (next !== loaded) {
        setData(next);
        saveFundOSData(next);
      }
    });
  }, []);

  const commit = useCallback((updater: (prev: FundOSData) => FundOSData) => {
    setData((prev) => {
      const next = updater(prev);
      saveFundOSData(next);
      return next;
    });
  }, []);

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
      updateValuationMark: (input) =>
        commit((prev) => patchValuationMark(prev, input)),
      updateSnapshot: (input) => commit((prev) => patchSnapshot(prev, input)),
      updateDeal: (input) => commit((prev) => patchDeal(prev, input)),
      updateFxRate: (input) => commit((prev) => patchFxRate(prev, input)),
      deleteRecord: (kind, id) =>
        commit((prev) => removeRecord(prev, kind, id)),
      refreshDisplayFx,
      resetData: () => {
        const bootstrap = createBootstrapData();
        saveFundOSData(bootstrap);
        setData(bootstrap);
      },
    }),
    [data, isLoading, isHydrated, commit, refreshDisplayFx]
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
