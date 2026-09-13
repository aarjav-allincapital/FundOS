"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useFundOS } from "@/providers/FundOSProvider";
import { useAuth } from "@/providers/AuthProvider";
import { SelectOptions } from "@/components/ui/SelectOptions";
import { CashInvestedField } from "@/components/forms/CashInvestedField";
import { DateInput } from "@/components/forms/form-ui";
import { calcCashInvestedLocal } from "@/lib/calc/lot";
import { suggestCompanyAbbr } from "@/lib/calc/abbr";
import { newCompanyId, syncCompanyLogo } from "@/lib/company-logo-sync";
import { FaviconPreview } from "@/components/forms/FaviconPreview";
import type { InstrumentType, MarkStatus, ValuationMark, ValuationType } from "@/lib/types";
import { markReprices } from "@/lib/data/valuation";

export type AddRecordMode =
  | "company"
  | "founder"
  | "lot"
  | "valuation"
  | "exit";

const ALL_MODES: { id: AddRecordMode; label: string }[] = [
  { id: "company", label: "Company" },
  { id: "founder", label: "Founder" },
  { id: "lot", label: "Investment Lot" },
  { id: "valuation", label: "Valuation Mark" },
  { id: "exit", label: "Exit" },
];

export function AddRecordModal({
  open,
  onClose,
  defaultMode = "company",
}: {
  open: boolean;
  onClose: () => void;
  defaultMode?: AddRecordMode;
}) {
  const { can } = useAuth();
  const modes = useMemo(
    () =>
      ALL_MODES.filter((m) => {
        if (m.id === "lot" || m.id === "exit") return can("edit_lots");
        if (m.id === "valuation") return can("edit_valuation_marks");
        return true;
      }),
    [can],
  );
  const safeDefault =
    modes.find((m) => m.id === defaultMode)?.id ?? modes[0]?.id ?? "company";
  const [mode, setMode] = useState<AddRecordMode>(safeDefault);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ctx = useFundOS();

  useEffect(() => {
    if (open) {
      setMode(safeDefault);
      setError(null);
    }
  }, [open, safeDefault]);

  async function runAsync(action: () => Promise<void>) {
    setSaving(true);
    setError(null);
    try {
      await action();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded border border-line bg-surface shadow-pop">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">Add Record</h2>
          <button type="button" onClick={onClose} className="text-ink-faint hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-line px-3 py-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {modes.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                className={cn(
                  "inline-flex min-h-[28px] shrink-0 items-center rounded-md px-2.5 py-1.5 text-2xs font-medium leading-normal transition-colors",
                  mode === m.id
                    ? "bg-ink text-surface"
                    : "text-ink-muted hover:bg-surface-subtle"
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-y-auto p-4">
          {error && (
            <p className="mb-3 rounded border border-loss/30 bg-loss/5 px-2.5 py-2 text-2xs text-loss">
              {error}
            </p>
          )}
          {mode === "company" && (
            <CompanyForm
              onSubmit={(v) => {
                ctx.addCompany(v);
                onClose();
              }}
            />
          )}
          {mode === "founder" && (
            <FounderForm
              companies={ctx.data.companies}
              onSubmit={(v) => {
                ctx.addFounder(v);
                onClose();
              }}
              onSubmitAndAnother={(v) => {
                ctx.addFounder(v);
              }}
            />
          )}
          {mode === "lot" && can("edit_lots") && (
            <LotForm
              funds={ctx.data.funds}
              companies={ctx.data.companies}
              saving={saving}
              onSubmit={(v) => runAsync(() => ctx.addLot(v))}
            />
          )}
          {mode === "valuation" && can("edit_valuation_marks") && (
            <ValuationForm
              companies={ctx.data.companies}
              valuationMarks={ctx.data.valuationMarks}
              saving={saving}
              onSubmit={(v) => runAsync(() => ctx.addValuationMark(v))}
            />
          )}
          {mode === "exit" && can("edit_lots") && (
            <ExitForm
              lots={ctx.data.investmentLots}
              companies={ctx.data.companies}
              saving={saving}
              onSubmit={(v) => runAsync(() => ctx.exitLot(v))}
              onWriteOff={(v) => runAsync(() => ctx.writeOffLots(v))}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="mb-3 flex flex-col gap-1">
      <span className="text-2xs font-medium uppercase tracking-wide text-ink-faint">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  "rounded border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-line-strong";

function Submit({
  label = "Save",
  saving = false,
  savingLabel = "Saving…",
}: {
  label?: string;
  saving?: boolean;
  savingLabel?: string;
}) {
  return (
    <button
      type="submit"
      disabled={saving}
      className="mt-2 w-full rounded bg-ink py-2 text-[13px] font-semibold text-surface hover:bg-ink/90 disabled:opacity-50"
    >
      {saving ? savingLabel : label}
    </button>
  );
}

function CompanyForm({
  onSubmit,
}: {
  onSubmit: (v: {
    id?: string;
    legal_name: string;
    brand_name?: string;
    sector?: string;
    hq_city?: string;
    hq_country?: string;
    operating_currency: string;
    abbr?: string;
    aliases?: string[];
    website?: string | null;
    logo_url?: string | null;
  }) => void;
}) {
  const [legalName, setLegalName] = useState("");
  const [brandName, setBrandName] = useState("");
  const [abbr, setAbbr] = useState("");
  const [abbrManual, setAbbrManual] = useState(false);
  const [website, setWebsite] = useState("");
  const [syncing, setSyncing] = useState(false);
  const previewLabel = brandName.trim() || legalName.trim();

  function syncAbbrFromName(nextLegal: string, nextBrand: string) {
    if (abbrManual) return;
    const source = nextBrand.trim() || nextLegal.trim();
    setAbbr(source ? suggestCompanyAbbr(source) : "");
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const websiteTrimmed = website.trim() || null;
        let logo_url: string | null = null;
        let companyId: string | undefined;

        setSyncing(true);
        try {
          if (websiteTrimmed) {
            companyId = newCompanyId();
            logo_url = await syncCompanyLogo(companyId, websiteTrimmed, previewLabel || undefined);
          }

          onSubmit({
            id: companyId,
            legal_name: legalName,
            brand_name: brandName || undefined,
            sector: String(fd.get("sector") || "") || undefined,
            hq_city: String(fd.get("hq_city") || "") || undefined,
            hq_country: String(fd.get("hq_country") || "") || undefined,
            operating_currency: String(fd.get("currency") || "INR"),
            abbr: abbr || undefined,
            aliases: String(fd.get("aliases") || "")
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean),
            website: websiteTrimmed,
            logo_url,
          });
        } finally {
          setSyncing(false);
        }
      }}
    >
      <Field label="Legal Name *">
        <input
          name="legal_name"
          required
          className={inputClass}
          value={legalName}
          onChange={(e) => {
            const next = e.target.value;
            setLegalName(next);
            syncAbbrFromName(next, brandName);
          }}
        />
      </Field>
      <Field label="Brand Name">
        <input
          name="brand_name"
          className={inputClass}
          value={brandName}
          onChange={(e) => {
            const next = e.target.value;
            setBrandName(next);
            syncAbbrFromName(legalName, next);
          }}
        />
      </Field>
      <Field label="Abbreviation">
        <input
          name="abbr"
          maxLength={4}
          className={inputClass}
          value={abbr}
          onChange={(e) => {
            const next = e.target.value.toUpperCase();
            setAbbr(next);
            setAbbrManual(next.length > 0);
          }}
        />
      </Field>
      <Field label="Aliases / Previous Names">
        <input
          name="aliases"
          className={inputClass}
          placeholder="Super Living, SLR (comma-separated)"
        />
      </Field>
      <Field label="Sector">
        <input name="sector" className={inputClass} />
      </Field>
      <Field label="Website">
        <div className="flex items-center gap-2">
          <input
            name="website"
            type="url"
            placeholder="https://example.com"
            className={cn(inputClass, "min-w-0 flex-1")}
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
          <FaviconPreview website={website} label={previewLabel || undefined} size={32} />
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="City">
          <input name="hq_city" className={inputClass} />
        </Field>
        <Field label="Country">
          <input name="hq_country" className={inputClass} defaultValue="IN" />
        </Field>
      </div>
      <Field label="Operating Currency *">
        <select name="currency" className={inputClass} defaultValue="INR">
          <option value="INR">INR</option>
          <option value="USD">USD</option>
        </select>
      </Field>
      <Submit label="Add Company" saving={syncing} savingLabel="Fetching logo…" />
    </form>
  );
}

function FounderForm({
  companies,
  onSubmit,
  onSubmitAndAnother,
  defaultCompanyId,
}: {
  companies: { id: string; brand_name: string | null; legal_name: string }[];
  onSubmit: (v: {
    company_id: string;
    name: string;
    role?: string;
    email?: string;
    linkedin_url?: string;
    is_primary?: boolean;
  }) => void;
  onSubmitAndAnother?: (v: {
    company_id: string;
    name: string;
    role?: string;
    email?: string;
    linkedin_url?: string;
    is_primary?: boolean;
  }) => void;
  defaultCompanyId?: string;
}) {
  const [companyId, setCompanyId] = useState(defaultCompanyId ?? "");
  const [formKey, setFormKey] = useState(0);

  function readForm(fd: FormData) {
    return {
      company_id: String(fd.get("company_id")),
      name: String(fd.get("name")),
      role: String(fd.get("role") || "") || undefined,
      email: String(fd.get("email") || "") || undefined,
      linkedin_url: String(fd.get("linkedin") || "") || undefined,
      is_primary: fd.get("is_primary") === "on",
    };
  }

  return (
    <form
      key={formKey}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(readForm(new FormData(e.currentTarget)));
      }}
    >
      <Field label="Company *">
        <select
          name="company_id"
          required
          className={inputClass}
          value={companyId}
          onChange={(e) => setCompanyId(e.target.value)}
        >
          <option value="">Select…</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.brand_name ?? c.legal_name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Name *">
        <input name="name" required className={inputClass} />
      </Field>
      <Field label="Role">
        <input name="role" className={inputClass} />
      </Field>
      <Field label="Email">
        <input name="email" type="email" className={inputClass} />
      </Field>
      <Field label="LinkedIn URL">
        <input name="linkedin" className={inputClass} />
      </Field>
      <label className="mb-3 flex items-center gap-2 text-[13px]">
        <input type="checkbox" name="is_primary" />
        Primary founder
      </label>
      <div className="flex flex-col gap-2">
        <Submit label="Add Founder" />
        {onSubmitAndAnother && (
          <button
            type="button"
            className="w-full rounded border border-line py-2 text-[13px] font-semibold text-ink transition-colors hover:bg-surface-subtle"
            onClick={(e) => {
              e.preventDefault();
              const form = e.currentTarget.closest("form");
              if (!form) return;
              const fd = new FormData(form);
              if (!fd.get("company_id") || !fd.get("name")) {
                form.reportValidity();
                return;
              }
              onSubmitAndAnother(readForm(fd));
              setFormKey((k) => k + 1);
              setCompanyId(String(fd.get("company_id")));
            }}
          >
            + Add another founder
          </button>
        )}
      </div>
    </form>
  );
}

function LotForm({
  funds,
  companies,
  saving,
  onSubmit,
}: {
  funds: {
    id: string;
    code: string;
    name: string;
    vehicle_code: string;
    currency: string;
  }[];
  companies: {
    id: string;
    brand_name: string | null;
    legal_name: string;
    operating_currency: string;
  }[];
  saving?: boolean;
  onSubmit: (v: {
    fund_id: string;
    company_id: string;
    round_name: string;
    investment_date: string;
    vehicle: InstrumentType;
    shares_acquired: number;
    price_per_share_local: number;
    currency: string;
    cash_invested_local: number;
    ownership_at_entry_pct?: number;
  }) => void;
}) {
  const [fundId, setFundId] = useState(funds[0]?.id ?? "");
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const [shares, setShares] = useState("");
  const [pps, setPps] = useState("");
  const selectedFund = funds.find((f) => f.id === fundId);
  const selectedCompany = companies.find((c) => c.id === companyId);
  const lotCurrency = selectedCompany?.operating_currency ?? selectedFund?.currency ?? "INR";
  const sharesNum = Number(shares) || 0;
  const ppsNum = Number(pps) || 0;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        onSubmit({
          fund_id: String(fd.get("fund_id")),
          company_id: String(fd.get("company_id")),
          round_name: String(fd.get("round_name")),
          investment_date: String(fd.get("investment_date")),
          vehicle: String(fd.get("vehicle")) as InstrumentType,
          shares_acquired: sharesNum,
          price_per_share_local: ppsNum,
          currency: String(fd.get("currency")),
          cash_invested_local: calcCashInvestedLocal(sharesNum, ppsNum),
          ownership_at_entry_pct: Number(fd.get("ownership")) || undefined,
        });
      }}
    >
      <Field label="Fund *">
        <select
          name="fund_id"
          required
          className={inputClass}
          value={fundId}
          onChange={(e) => setFundId(e.target.value)}
        >
          {funds.map((f) => (
            <option key={f.id} value={f.id}>
              {f.vehicle_code === "F1"
                ? "Fund 1 (USD)"
                : f.vehicle_code === "F2"
                  ? "Fund 2 (INR)"
                  : f.name}{" "}
              ({f.code})
            </option>
          ))}
        </select>
      </Field>
      <Field label="Company *">
        <select
          name="company_id"
          required
          className={inputClass}
          value={companyId}
          onChange={(e) => setCompanyId(e.target.value)}
        >
          <option value="">Select…</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.brand_name ?? c.legal_name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Round *">
        <input name="round_name" required className={inputClass} placeholder="Seed, Series A…" />
      </Field>
      <Field label="Investment Date *">
        <DateInput name="investment_date" required />
      </Field>
      <Field label="Vehicle *">
        <select name="vehicle" className={inputClass} defaultValue="ccps">
          <SelectOptions
            values={["ccps", "preferred", "common", "safe", "note"] as InstrumentType[]}
          />
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Shares *">
          <input
            name="shares"
            type="number"
            required
            className={inputClass}
            value={shares}
            onChange={(e) => setShares(e.target.value)}
          />
        </Field>
        <Field label={`Price / Share (${lotCurrency}) *`}>
          <input
            name="pps"
            type="number"
            step="any"
            required
            className={inputClass}
            value={pps}
            onChange={(e) => setPps(e.target.value)}
          />
        </Field>
      </div>
      <CashInvestedField currency={lotCurrency} shares={sharesNum} pricePerShare={ppsNum} />
      <Field label="Currency *">
        <input type="hidden" name="currency" value={lotCurrency} />
        <input className={inputClass} value={lotCurrency} disabled readOnly />
      </Field>
      <Field label="Ownership % at Entry">
        <input name="ownership" type="number" step="any" className={inputClass} />
      </Field>
      <p className="mb-2 text-2xs text-ink-faint">
        Price and shares are entered in the company&apos;s operating currency
        ({lotCurrency}) — cash invested is calculated from those. This must
        match how valuation marks for this company are priced, so cost and FMV
        stay comparable. Fund 1 is USD and Fund 2 is INR; transaction FX
        converts local cash into the fund currency and can be edited later on
        the lot.
      </p>
      <Submit label="Add Investment Lot" saving={saving} />
    </form>
  );
}

function ValuationForm({
  companies,
  valuationMarks,
  saving,
  onSubmit,
}: {
  companies: {
    id: string;
    brand_name: string | null;
    legal_name: string;
    operating_currency: string;
  }[];
  valuationMarks: ValuationMark[];
  saving?: boolean;
  onSubmit: (v: {
    company_id: string;
    valuation_date: string;
    valuation_type: ValuationType;
    mark_status?: MarkStatus | null;
    price_per_share_local: number;
    shares?: number;
    pre_money_local?: number;
    post_money_local?: number;
  }) => void;
}) {
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const [markType, setMarkType] = useState<ValuationType>("entry_round");
  const [markStatus, setMarkStatus] = useState<MarkStatus>("closed");
  const selectedCompany = companies.find((c) => c.id === companyId);
  const ccy = selectedCompany?.operating_currency ?? "INR";
  const isExternal = markType === "external_mark";
  const isImpairment = markType === "write_down";
  const isTermsheetOpen = isExternal && markStatus === "termsheet";
  // Priced from an SHA: entry round, or a closed external round.
  const isPriced = markType === "entry_round" || (isExternal && markStatus === "closed");

  // Post-money of the LAST closed round (shown as context for an open term
  // sheet). Term-sheet marks don't reprice, so they're excluded here.
  const lastRoundPostMoney = valuationMarks
    .filter(
      (m) =>
        m.company_id === companyId &&
        m.post_money_local != null &&
        markReprices(m.valuation_type, m.mark_status),
    )
    .sort((a, b) => (a.valuation_date < b.valuation_date ? 1 : -1))[0]
    ?.post_money_local;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        onSubmit({
          company_id: String(fd.get("company_id")),
          valuation_date: String(fd.get("date")),
          valuation_type: markType,
          mark_status: isExternal ? markStatus : null,
          // A term sheet on an open round has no final price yet.
          price_per_share_local: isTermsheetOpen ? 0 : Number(fd.get("pps")),
          shares: isPriced ? Number(fd.get("shares")) || undefined : undefined,
          pre_money_local: Number(fd.get("pre_money")) || undefined,
          post_money_local: isTermsheetOpen
            ? undefined
            : Number(fd.get("post_money")) || undefined,
        });
      }}
    >
      <Field label="Company *">
        <select
          name="company_id"
          required
          className={inputClass}
          value={companyId}
          onChange={(e) => setCompanyId(e.target.value)}
        >
          <option value="">Select…</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.brand_name ?? c.legal_name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Valuation Date *">
        <DateInput name="date" required />
      </Field>
      <Field label="Type *">
        <select
          name="type"
          className={inputClass}
          value={markType}
          onChange={(e) => setMarkType(e.target.value as ValuationType)}
        >
          <option value="entry_round">Entry round (we lead)</option>
          <option value="external_mark">External mark</option>
          <option value="write_down">Write-down</option>
        </select>
      </Field>

      {isExternal && (
        <div className="mb-3 rounded border border-line bg-surface-subtle p-2.5">
          <div className="mb-2 text-2xs font-semibold uppercase tracking-wide text-ink-faint">
            External mark
          </div>
          <Field label="Round status *">
            <select
              className={inputClass}
              value={markStatus}
              onChange={(e) => setMarkStatus(e.target.value as MarkStatus)}
            >
              <option value="termsheet">Term sheet — round open</option>
              <option value="closed">Round closed</option>
            </select>
          </Field>
        </div>
      )}

      {/* Term sheet, round open: pre-money of THIS round + post-money of the
          LAST round (shown for context). No final price yet. */}
      {isTermsheetOpen && (
        <>
          <Field label={`Pre-Money — this round (${ccy}) *`}>
            <input name="pre_money" type="number" step="any" required className={inputClass} />
          </Field>
          <Field label={`Post-Money — last round (${ccy})`}>
            <input
              readOnly
              value={
                lastRoundPostMoney != null
                  ? lastRoundPostMoney.toLocaleString()
                  : "— no prior closed round"
              }
              className={`${inputClass} bg-surface-subtle text-ink-muted`}
            />
          </Field>
          <p className="mb-2 text-2xs text-ink-faint">
            Round is open — recorded for reference only. It does not move NAV
            until you switch it to “Round closed”.
          </p>
        </>
      )}

      {/* Priced round (entry / closed external): price + shares from the SHA. */}
      {isPriced && (
        <>
          <Field label={`Price / Share (${ccy}) *`}>
            <input name="pps" type="number" step="any" required className={inputClass} />
          </Field>
          <Field label="Number of Shares (from SHA)">
            <input name="shares" type="number" step="any" className={inputClass} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={`Pre-Money (${ccy})`}>
              <input name="pre_money" type="number" step="any" className={inputClass} />
            </Field>
            <Field label={`Post-Money (${ccy})`}>
              <input name="post_money" type="number" step="any" className={inputClass} />
            </Field>
          </div>
          <p className="mb-2 text-2xs text-ink-faint">
            Price / share and shares come from the SHA. Fetches reporting FX and
            reprices position snapshots for all active lots in this company.
          </p>
        </>
      )}

      {/* Write-down: just the impaired price. */}
      {isImpairment && (
        <Field label={`Price / Share (${ccy}) *`}>
          <input name="pps" type="number" step="any" required className={inputClass} />
        </Field>
      )}

      <Submit label="Add Valuation Mark" saving={saving} />
    </form>
  );
}

function ExitForm({
  lots,
  companies,
  saving,
  onSubmit,
  onWriteOff,
}: {
  lots: {
    id: string;
    code: string;
    company_id: string;
    currency: string;
    shares_acquired: number | null;
    status: string;
  }[];
  companies: { id: string; brand_name: string | null; legal_name: string }[];
  saving?: boolean;
  onSubmit: (v: {
    lot_id: string;
    realization_date: string;
    event_type: "partial_exit" | "full_exit" | "write_off";
    shares_sold?: number;
    price_per_share?: number;
    notes?: string;
  }) => void;
  onWriteOff: (v: {
    lot_ids: string[];
    realization_date: string;
    amount_recovered?: number;
    notes?: string;
  }) => void;
}) {
  const openLots = lots.filter(
    (l) => l.status === "active" || l.status === "partial_exit"
  );
  const [lotId, setLotId] = useState(openLots[0]?.id ?? "");
  const [eventType, setEventType] = useState<
    "partial_exit" | "full_exit" | "write_off"
  >("full_exit");
  const selectedLot = openLots.find((l) => l.id === lotId);
  const heldShares = selectedLot?.shares_acquired ?? undefined;
  const [sharesSold, setSharesSold] = useState<string>(
    heldShares != null ? String(heldShares) : ""
  );
  const ccy = selectedLot?.currency ?? "INR";
  const isWriteOff = eventType === "write_off";

  // Write-off is company-scoped: pick the company, tick the lots to write off,
  // and enter what (if anything) was recovered. Price/share is derived.
  const companiesWithOpenLots = companies.filter((c) =>
    openLots.some((l) => l.company_id === c.id)
  );
  const [woCompanyId, setWoCompanyId] = useState(
    companiesWithOpenLots[0]?.id ?? ""
  );
  const woLots = openLots.filter((l) => l.company_id === woCompanyId);
  const [woLotIds, setWoLotIds] = useState<string[]>([]);
  const [recovered, setRecovered] = useState<string>("");
  const woCcy = woLots[0]?.currency ?? "INR";
  const selectedWoLots = woLots.filter((l) => woLotIds.includes(l.id));
  const woTotalShares = selectedWoLots.reduce(
    (s, l) => s + (l.shares_acquired ?? 0),
    0
  );
  const derivedPps =
    woTotalShares > 0 ? (Number(recovered) || 0) / woTotalShares : 0;

  function toggleWoLot(id: string) {
    setWoLotIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        if (isWriteOff) {
          onWriteOff({
            lot_ids: woLotIds,
            realization_date: String(fd.get("date")),
            amount_recovered: Number(fd.get("recovered")) || 0,
            notes: String(fd.get("notes") || "") || undefined,
          });
          return;
        }
        onSubmit({
          lot_id: String(fd.get("lot_id")),
          realization_date: String(fd.get("date")),
          event_type: eventType,
          shares_sold: Number(fd.get("shares")) || undefined,
          price_per_share: Number(fd.get("pps")) || undefined,
          notes: String(fd.get("notes") || "") || undefined,
        });
      }}
    >
      <Field label="Event *">
        <select
          name="event_type"
          className={inputClass}
          value={eventType}
          onChange={(e) =>
            setEventType(
              e.target.value as "partial_exit" | "full_exit" | "write_off"
            )
          }
        >
          <option value="full_exit">Full exit</option>
          <option value="partial_exit">Partial exit</option>
          <option value="write_off">Write-off</option>
        </select>
      </Field>

      {!isWriteOff && (
        <Field label="Lot *">
          <select
            name="lot_id"
            required
            className={inputClass}
            value={lotId}
            onChange={(e) => {
              const nextId = e.target.value;
              setLotId(nextId);
              const lot = openLots.find((l) => l.id === nextId);
              setSharesSold(
                lot?.shares_acquired != null ? String(lot.shares_acquired) : ""
              );
            }}
          >
            <option value="">Select…</option>
            {openLots.map((l) => {
              const c = companies.find((x) => x.id === l.company_id);
              return (
                <option key={l.id} value={l.id}>
                  {l.code} — {c?.brand_name ?? c?.legal_name}
                </option>
              );
            })}
          </select>
        </Field>
      )}

      {isWriteOff && (
        <>
          <Field label="Company *">
            <select
              className={inputClass}
              value={woCompanyId}
              onChange={(e) => {
                setWoCompanyId(e.target.value);
                setWoLotIds([]);
              }}
            >
              <option value="">Select…</option>
              {companiesWithOpenLots.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.brand_name ?? c.legal_name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Lots to write off *">
            <div className="flex flex-col gap-1 rounded border border-line p-2">
              {woLots.length === 0 && (
                <span className="text-2xs text-ink-faint">
                  No open lots for this company.
                </span>
              )}
              {woLots.map((l) => (
                <label
                  key={l.id}
                  className="flex items-center gap-2 text-[13px] text-ink"
                >
                  <input
                    type="checkbox"
                    checked={woLotIds.includes(l.id)}
                    onChange={() => toggleWoLot(l.id)}
                  />
                  <span className="font-medium">{l.code}</span>
                  <span className="text-ink-faint">
                    · {(l.shares_acquired ?? 0).toLocaleString()} shares
                  </span>
                </label>
              ))}
            </div>
          </Field>
        </>
      )}

      <Field label="Realization Date *">
        <DateInput name="date" required />
      </Field>

      {!isWriteOff && (
        <>
          <Field label="Shares Sold *">
            <input
              name="shares"
              type="number"
              step="any"
              required
              value={sharesSold}
              onChange={(e) => setSharesSold(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label={`Exit Price / Share (${ccy}) *`}>
            <input name="pps" type="number" step="any" required className={inputClass} />
          </Field>
        </>
      )}

      {isWriteOff && (
        <Field label={`Amount Recovered (${woCcy})`}>
          <input
            name="recovered"
            type="number"
            step="any"
            min="0"
            placeholder="0 — total loss"
            value={recovered}
            onChange={(e) => setRecovered(e.target.value)}
            className={inputClass}
          />
        </Field>
      )}

      <Field label="Notes">
        <input name="notes" className={inputClass} />
      </Field>

      {isWriteOff ? (
        <p className="mb-2 text-2xs text-ink-faint">
          Writes off {selectedWoLots.length || "the selected"} lot
          {selectedWoLots.length === 1 ? "" : "s"}
          {woTotalShares > 0
            ? ` (${woTotalShares.toLocaleString()} shares)`
            : ""}
          . Any amount recovered is split across the lots by shares, so the
          derived exit price is{" "}
          <strong>
            {derivedPps.toLocaleString(undefined, {
              maximumFractionDigits: 4,
            })}{" "}
            {woCcy}/share
          </strong>
          . The rest of each lot&apos;s cost basis becomes a realized loss.
        </p>
      ) : (
        <p className="mb-2 text-2xs text-ink-faint">
          Records realized proceeds in the lot’s currency and converts to the
          fund currency using reporting FX. Feeds DPI and gross MOIC.
        </p>
      )}

      <Submit
        label={isWriteOff ? "Record Write-off" : "Record Exit"}
        saving={saving}
      />
    </form>
  );
}

export function AddButton({
  mode = "company",
  label = "Add",
}: {
  mode?: AddRecordMode;
  label?: string;
}) {
  const { can } = useAuth();
  const [open, setOpen] = useState(false);

  if (
    ((mode === "lot" || mode === "exit") && !can("edit_lots")) ||
    (mode === "valuation" && !can("edit_valuation_marks"))
  ) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded border border-line bg-surface px-3 py-1.5 text-2xs font-semibold text-ink transition-colors hover:border-line-strong hover:bg-surface-subtle"
      >
        + {label}
      </button>
      <AddRecordModal open={open} onClose={() => setOpen(false)} defaultMode={mode} />
    </>
  );
}
