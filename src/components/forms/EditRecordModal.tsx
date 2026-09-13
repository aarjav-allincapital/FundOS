"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useFundOS } from "@/providers/FundOSProvider";
import { SelectOptions } from "@/components/ui/SelectOptions";
import { Field, inputClass, Submit, DateInput } from "@/components/forms/form-ui";
import { CashInvestedField } from "@/components/forms/CashInvestedField";
import { FaviconPreview } from "@/components/forms/FaviconPreview";
import { calcCashInvestedLocal } from "@/lib/calc/lot";
import { syncCompanyLogo } from "@/lib/company-logo-sync";
import type {
  ApprovalStatus,
  FundOSData,
  InstrumentType,
  LotStatus,
  MarkStatus,
  ValuationType,
} from "@/lib/types";
import type { UpdateLotInput } from "@/lib/data/updates";

export type EditRecordMode =
  | "company"
  | "founder"
  | "fund"
  | "lot"
  | "valuation"
  | "snapshot"
  | "fx";

const TITLES: Record<EditRecordMode, string> = {
  company: "Edit Company",
  founder: "Edit Founder",
  fund: "Edit Fund & Economics",
  lot: "Edit Investment Lot",
  valuation: "Edit Valuation Mark",
  snapshot: "Edit Snapshot",
  fx: "Edit FX Rate",
};

export function EditRecordModal({
  open,
  onClose,
  mode,
  recordId,
}: {
  open: boolean;
  onClose: () => void;
  mode: EditRecordMode;
  recordId: string;
}) {
  const ctx = useFundOS();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) setError(null);
  }, [open, recordId]);

  if (!open) return null;

  async function save(action: () => void | Promise<void>) {
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

  const { data } = ctx;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded border border-line bg-surface shadow-pop">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">{TITLES[mode]}</h2>
          <button type="button" onClick={onClose} className="text-ink-faint hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto p-4">
          {error && (
            <p className="mb-3 rounded border border-loss/30 bg-loss/5 px-2.5 py-2 text-2xs text-loss">
              {error}
            </p>
          )}

          {mode === "company" && (() => {
            const c = data.companies.find((x) => x.id === recordId);
            if (!c) return <Missing />;
            return (
              <CompanyEditForm
                company={c}
                saving={saving}
                onSave={(input) => save(() => ctx.updateCompany(input))}
              />
            );
          })()}

          {mode === "founder" && (() => {
            const f = data.founders.find((x) => x.id === recordId);
            if (!f) return <Missing />;
            return (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  save(() =>
                    ctx.updateFounder({
                      id: f.id,
                      company_id: String(fd.get("company_id")),
                      name: String(fd.get("name")),
                      role: String(fd.get("role") || "") || null,
                      email: String(fd.get("email") || "") || null,
                      linkedin_url: String(fd.get("linkedin") || "") || null,
                      is_primary: fd.get("is_primary") === "on",
                    })
                  );
                }}
              >
                <Field label="Company *">
                  <select name="company_id" required defaultValue={f.company_id} className={inputClass}>
                    {data.companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.brand_name ?? c.legal_name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Name *">
                  <input name="name" required defaultValue={f.name} className={inputClass} />
                </Field>
                <Field label="Role">
                  <input name="role" defaultValue={f.role ?? ""} className={inputClass} />
                </Field>
                <Field label="Email">
                  <input name="email" type="email" defaultValue={f.email ?? ""} className={inputClass} />
                </Field>
                <Field label="LinkedIn URL">
                  <input name="linkedin" defaultValue={f.linkedin_url ?? ""} className={inputClass} />
                </Field>
                <label className="mb-3 flex items-center gap-2 text-[13px]">
                  <input type="checkbox" name="is_primary" defaultChecked={f.is_primary} />
                  Primary founder
                </label>
                <Submit label="Save Changes" saving={saving} />
              </form>
            );
          })()}

          {mode === "lot" && (
            <LotEditForm
              lotId={recordId}
              data={data}
              saving={saving}
              onSave={(v) => save(() => ctx.updateLot(v))}
            />
          )}

          {mode === "valuation" && (() => {
            const m = data.valuationMarks.find((x) => x.id === recordId);
            if (!m) return <Missing />;
            const company = data.companies.find((c) => c.id === m.company_id);
            return (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  const valType = String(fd.get("type")) as ValuationType;
                  const status =
                    valType === "external_mark"
                      ? (String(fd.get("mark_status")) as MarkStatus)
                      : null;
                  save(() =>
                    ctx.updateValuationMark({
                      id: m.id,
                      valuation_date: String(fd.get("date")),
                      valuation_type: valType,
                      mark_status: status,
                      price_per_share_local: Number(fd.get("pps")),
                      shares: Number(fd.get("shares")) || null,
                      pre_money_local: Number(fd.get("pre_money")) || null,
                      post_money_local: Number(fd.get("post_money")) || null,
                      approval_status: String(fd.get("status")) as ApprovalStatus,
                      notes: String(fd.get("notes") || "") || null,
                    })
                  );
                }}
              >
                {company && (
                  <p className="mb-3 text-2xs text-ink-muted">
                    {company.brand_name || company.legal_name} — saving reprices
                    linked snapshots. Switch an external mark to “Round closed”
                    to fold it into NAV.
                  </p>
                )}
                <Field label="Valuation Date *">
                  <DateInput name="date" required defaultValue={m.valuation_date} />
                </Field>
                <Field label="Type *">
                  <select name="type" defaultValue={m.valuation_type} className={inputClass}>
                    <option value="entry_round">Entry round (we lead)</option>
                    <option value="external_mark">External mark</option>
                    <option value="write_down">Write-down</option>
                  </select>
                </Field>
                <Field label="Round status (external marks)">
                  <select
                    name="mark_status"
                    defaultValue={m.mark_status ?? "closed"}
                    className={inputClass}
                  >
                    <option value="termsheet">Term sheet — round open</option>
                    <option value="closed">Round closed</option>
                  </select>
                </Field>
                <Field label={`Price / Share (${m.currency}) *`}>
                  <input
                    name="pps"
                    type="number"
                    step="any"
                    required
                    defaultValue={m.price_per_share_local}
                    className={inputClass}
                  />
                </Field>
                <Field label="Number of Shares (from SHA)">
                  <input
                    name="shares"
                    type="number"
                    step="any"
                    defaultValue={m.shares ?? ""}
                    className={inputClass}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label={`Pre-Money (${m.currency})`}>
                    <input
                      name="pre_money"
                      type="number"
                      step="any"
                      defaultValue={m.pre_money_local ?? ""}
                      className={inputClass}
                    />
                  </Field>
                  <Field label={`Post-Money (${m.currency})`}>
                    <input
                      name="post_money"
                      type="number"
                      step="any"
                      defaultValue={m.post_money_local ?? ""}
                      className={inputClass}
                    />
                  </Field>
                </div>
                <Field label="Approval Status">
                  <select name="status" defaultValue={m.approval_status} className={inputClass}>
                    <SelectOptions values={["draft", "pending", "approved"] as ApprovalStatus[]} />
                  </select>
                </Field>
                <Field label="Notes">
                  <input name="notes" defaultValue={m.notes ?? ""} className={inputClass} />
                </Field>
                <Submit label="Save Changes" saving={saving} />
              </form>
            );
          })()}

          {mode === "snapshot" && (() => {
            const s = data.positionSnapshots.find((x) => x.id === recordId);
            if (!s) return <Missing />;
            const snapCcy =
              data.investmentLots.find((l) => l.id === s.lot_id)?.currency ?? s.currency;
            return (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  save(() =>
                    ctx.updateSnapshot({
                      id: s.id,
                      snapshot_date: String(fd.get("date")),
                      mark_price_per_share_local: Number(fd.get("pps")),
                      as_converted_shares: Number(fd.get("shares")) || undefined,
                      notes: String(fd.get("notes") || "") || null,
                    })
                  );
                }}
              >
                <Field label="Snapshot ID">
                  <input readOnly value={s.snapshot_code} className={`${inputClass} bg-surface-subtle`} />
                </Field>
                <Field label="Snapshot Date *">
                  <DateInput name="date" required defaultValue={s.snapshot_date} />
                </Field>
                <Field label={`Mark Price / Share (${snapCcy}) *`}>
                  <input
                    name="pps"
                    type="number"
                    step="any"
                    required
                    defaultValue={s.mark_price_per_share_local}
                    className={inputClass}
                  />
                </Field>
                <Field label="As-Converted Shares">
                  <input
                    name="shares"
                    type="number"
                    step="any"
                    defaultValue={s.as_converted_shares}
                    className={inputClass}
                  />
                </Field>
                <Field label="Notes">
                  <input name="notes" defaultValue={s.notes ?? ""} className={inputClass} />
                </Field>
                <Submit label="Save Changes" saving={saving} />
              </form>
            );
          })()}

          {mode === "fx" && (() => {
            const fx = data.fxRates.find((x) => x.id === recordId);
            if (!fx) return <Missing />;
            return (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  save(() =>
                    ctx.updateFxRate({
                      id: fx.id,
                      from_currency: String(fd.get("from")),
                      to_currency: String(fd.get("to")),
                      rate: Number(fd.get("rate")),
                      rate_date: String(fd.get("date")),
                    })
                  );
                }}
              >
                <Field label="Purpose">
                  <input
                    readOnly
                    value={fx.purpose ?? "manual"}
                    className={`${inputClass} bg-surface-subtle`}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="From *">
                    <select name="from" defaultValue={fx.from_currency} className={inputClass}>
                      <option value="INR">INR</option>
                      <option value="USD">USD</option>
                    </select>
                  </Field>
                  <Field label="To *">
                    <select name="to" defaultValue={fx.to_currency} className={inputClass}>
                      <option value="USD">USD</option>
                      <option value="INR">INR</option>
                    </select>
                  </Field>
                </div>
                <Field label="Rate *">
                  <input name="rate" type="number" step="any" required defaultValue={fx.rate} className={inputClass} />
                </Field>
                <Field label="Date *">
                  <DateInput name="date" required defaultValue={fx.rate_date} />
                </Field>
                <Submit label="Save Changes" saving={saving} />
              </form>
            );
          })()}

          {mode === "fund" && (() => {
            const fund = data.funds.find((x) => x.id === recordId);
            if (!fund) return <Missing />;
            // Economics are stored as decimals (0.02); the form shows percents (2).
            const asPct = (v: number | null | undefined) =>
              v == null ? "" : String(Math.round(v * 10000) / 100);
            return (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  const num = (k: string) => {
                    const s = String(fd.get(k) ?? "").trim();
                    return s === "" ? null : Number(s);
                  };
                  const fromPct = (k: string) => {
                    const n = num(k);
                    return n == null ? null : n / 100;
                  };
                  save(() =>
                    ctx.updateFund({
                      id: fund.id,
                      name: String(fd.get("name")),
                      vintage_year: num("vintage"),
                      committed_capital_fund: num("committed"),
                      mgmt_fee_pct: fromPct("mgmt_fee"),
                      mgmt_fee_basis: String(fd.get("fee_basis")) as
                        | "committed"
                        | "deployed",
                      carry_pct: fromPct("carry"),
                      hurdle_pct: fromPct("hurdle"),
                      waterfall_style: String(fd.get("waterfall")) as "european" | "american",
                      catch_up: String(fd.get("catch_up")) as "full" | "half" | "none",
                    })
                  );
                }}
              >
                <Field label="Fund Name *">
                  <input name="name" required defaultValue={fund.name} className={inputClass} />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Vintage Year">
                    <input
                      name="vintage"
                      type="number"
                      defaultValue={fund.vintage_year ?? ""}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Reporting Currency">
                    <input
                      readOnly
                      value={fund.currency}
                      className={`${inputClass} bg-surface-subtle text-ink-muted`}
                    />
                  </Field>
                </div>

                <div className="mb-2 mt-1 border-t border-line pt-2 text-2xs font-medium uppercase tracking-wide text-ink-faint">
                  Economics — drive Net IRR
                </div>
                <Field label={`Committed Capital (${fund.currency})`}>
                  <input
                    name="committed"
                    type="number"
                    step="any"
                    defaultValue={fund.committed_capital_fund ?? ""}
                    className={inputClass}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Mgmt Fee % / yr">
                    <input
                      name="mgmt_fee"
                      type="number"
                      step="any"
                      defaultValue={asPct(fund.mgmt_fee_pct)}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Fee Basis">
                    <select
                      name="fee_basis"
                      defaultValue={fund.mgmt_fee_basis ?? "deployed"}
                      className={inputClass}
                    >
                      <option value="deployed">Deployed capital</option>
                      <option value="committed">Committed capital</option>
                    </select>
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Carried Interest %">
                    <input
                      name="carry"
                      type="number"
                      step="any"
                      defaultValue={asPct(fund.carry_pct)}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Preferred / Hurdle % / yr">
                    <input
                      name="hurdle"
                      type="number"
                      step="any"
                      defaultValue={asPct(fund.hurdle_pct)}
                      className={inputClass}
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Waterfall">
                    <select
                      name="waterfall"
                      defaultValue={fund.waterfall_style ?? "european"}
                      className={inputClass}
                    >
                      <option value="european">European (whole-fund)</option>
                      <option value="american">American (deal-by-deal)</option>
                    </select>
                  </Field>
                  <Field label="Catch-up">
                    <select
                      name="catch_up"
                      defaultValue={fund.catch_up ?? "full"}
                      className={inputClass}
                    >
                      <option value="full">Full catch-up</option>
                      <option value="half">Half catch-up</option>
                      <option value="none">No catch-up</option>
                    </select>
                  </Field>
                </div>
                <p className="mb-2 text-2xs text-ink-faint">
                  Fee basis &ldquo;Committed&rdquo; charges on committed capital;
                  &ldquo;Deployed&rdquo; on paid-in. Carry applies to profit above
                  return of capital plus the hurdle. Net IRR is a modeled
                  approximation, not booked fees.
                </p>
                <Submit label="Save Changes" saving={saving} />
              </form>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

function Missing() {
  return <p className="text-2xs text-ink-faint">Record not found.</p>;
}

function CompanyEditForm({
  company,
  saving,
  onSave,
}: {
  company: FundOSData["companies"][number];
  saving: boolean;
  onSave: (input: {
    id: string;
    legal_name: string;
    brand_name: string | null;
    abbr: string | null;
    aliases: string[] | null;
    sector: string | null;
    hq_city: string | null;
    hq_country: string | null;
    operating_currency: string;
    status: string;
    website: string | null;
    logo_url: string | null;
  }) => void;
}) {
  const [website, setWebsite] = useState(company.website ?? "");
  const [syncing, setSyncing] = useState(false);
  const previewLabel = company.brand_name ?? company.legal_name;
  const busy = saving || syncing;

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const websiteTrimmed = website.trim() || null;
        let logo_url: string | null = company.logo_url;

        setSyncing(true);
        try {
          if (!websiteTrimmed) {
            logo_url = null;
          } else {
            // Always re-sync so Save persists exactly what the preview showed
            // (also self-heals any stale or corrupt stored logo).
            logo_url = await syncCompanyLogo(company.id, websiteTrimmed, previewLabel);
          }

          onSave({
            id: company.id,
            legal_name: String(fd.get("legal_name")),
            brand_name: String(fd.get("brand_name") || "") || null,
            abbr: String(fd.get("abbr") || "") || null,
            aliases: String(fd.get("aliases") || "")
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean),
            sector: String(fd.get("sector") || "") || null,
            hq_city: String(fd.get("hq_city") || "") || null,
            hq_country: String(fd.get("hq_country") || "") || null,
            operating_currency: String(fd.get("currency")),
            status: String(fd.get("status")),
            website: websiteTrimmed,
            logo_url,
          });
        } finally {
          setSyncing(false);
        }
      }}
    >
      <Field label="Legal Name *">
        <input name="legal_name" required defaultValue={company.legal_name} className={inputClass} />
      </Field>
      <Field label="Brand Name">
        <input name="brand_name" defaultValue={company.brand_name ?? ""} className={inputClass} />
      </Field>
      <Field label="Abbreviation">
        <input name="abbr" defaultValue={company.abbr ?? ""} maxLength={4} className={inputClass} />
      </Field>
      <Field label="Aliases / Previous Names">
        <input
          name="aliases"
          defaultValue={(company.aliases ?? []).join(", ")}
          className={inputClass}
          placeholder="Super Living, SLR (comma-separated)"
        />
      </Field>
      <Field label="Sector">
        <input name="sector" defaultValue={company.sector ?? ""} className={inputClass} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="City">
          <input name="hq_city" defaultValue={company.hq_city ?? ""} className={inputClass} />
        </Field>
        <Field label="Country">
          <input name="hq_country" defaultValue={company.hq_country ?? ""} className={inputClass} />
        </Field>
      </div>
      <Field label="Website">
        <div className="flex items-center gap-2">
          <input
            name="website"
            type="url"
            placeholder="https://example.com"
            className={`${inputClass} min-w-0 flex-1`}
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
          <FaviconPreview website={website} label={previewLabel} size={32} />
        </div>
      </Field>
      <Field label="Operating Currency *">
        <select name="currency" defaultValue={company.operating_currency} className={inputClass}>
          <option value="INR">INR</option>
          <option value="USD">USD</option>
        </select>
      </Field>
      <Field label="Status">
        <select name="status" defaultValue={company.status} className={inputClass}>
          <SelectOptions values={["active", "exited", "written_off"]} />
        </select>
      </Field>
      <Submit label="Save Changes" saving={busy} />
    </form>
  );
}

function fundLabel(f: { vehicle_code: string; name: string }): string {
  if (f.vehicle_code === "F1") return "Fund 1 (USD)";
  if (f.vehicle_code === "F2") return "Fund 2 (INR)";
  return f.name;
}

function LotEditForm({
  lotId,
  data,
  saving,
  onSave,
}: {
  lotId: string;
  data: FundOSData;
  saving: boolean;
  onSave: (input: UpdateLotInput) => void;
}) {
  const lot = data.investmentLots.find((x) => x.id === lotId);
  const round = data.rounds.find((r) => r.id === lot?.round_id);
  const company = data.companies.find((c) => c.id === lot?.company_id);
  const [fundId, setFundId] = useState(lot?.fund_id ?? data.funds[0]?.id ?? "");
  const [currency, setCurrency] = useState(lot?.currency ?? "INR");
  const [shares, setShares] = useState(String(lot?.shares_acquired ?? ""));
  const [pps, setPps] = useState(String(lot?.price_per_share_local ?? ""));

  if (!lot) return <Missing />;

  const sharesNum = shares === "" ? null : Number(shares);
  const ppsNum = Number(pps) || 0;

  const fund = data.funds.find((f) => f.id === fundId);
  const currencyMismatch = company && company.operating_currency !== currency;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        onSave({
          id: lot.id,
          fund_id: fundId,
          round_name: String(fd.get("round_name")),
          vehicle: String(fd.get("vehicle")) as InstrumentType,
          shares_acquired: sharesNum,
          ownership_at_entry_pct: Number(fd.get("ownership")) || null,
          status: String(fd.get("status")) as LotStatus,
          price_per_share_local: ppsNum,
          cash_invested_local: calcCashInvestedLocal(sharesNum, ppsNum),
          fx_rate_at_entry: Number(fd.get("fx")),
          currency,
          investment_date: String(fd.get("investment_date")),
        });
      }}
    >
      <Field label="Lot Code">
        <input readOnly value={lot.code} className={`${inputClass} bg-surface-subtle`} />
      </Field>
      <Field label="Investment Date *">
        <DateInput name="investment_date" required defaultValue={lot.investment_date} />
      </Field>
      <Field label="Fund *">
        <select
          name="fund_id"
          className={inputClass}
          value={fundId}
          onChange={(e) => setFundId(e.target.value)}
        >
          {data.funds.map((f) => (
            <option key={f.id} value={f.id}>
              {fundLabel(f)}
            </option>
          ))}
        </select>
      </Field>
      <p className="mb-2 text-2xs text-ink-faint">
        Moving this lot to a different fund changes which fund&apos;s
        currency ({fund?.currency ?? "—"}) the cost basis rolls up in —
        update the transaction FX below if it should change too.
      </p>
      <Field label="Round *">
        <input
          name="round_name"
          required
          defaultValue={round?.round_name ?? ""}
          className={inputClass}
        />
      </Field>
      <Field label="Vehicle *">
        <select name="vehicle" defaultValue={lot.vehicle} className={inputClass}>
          <SelectOptions
            values={["ccps", "preferred", "common", "safe", "note"] as InstrumentType[]}
          />
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Shares">
          <input
            name="shares"
            type="number"
            value={shares}
            onChange={(e) => setShares(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label={`Price / Share (${currency}) *`}>
          <input
            name="pps"
            type="number"
            step="any"
            required
            value={pps}
            onChange={(e) => setPps(e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>
      <CashInvestedField currency={currency} shares={sharesNum} pricePerShare={ppsNum} />
      <Field label="Lot Currency *">
        <select
          name="currency"
          className={inputClass}
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
        >
          <option value="INR">INR</option>
          <option value="USD">USD</option>
        </select>
      </Field>
      {company && (
        <p className="mb-2 text-2xs text-ink-faint">
          {company.brand_name ?? company.legal_name}&apos;s operating
          currency is {company.operating_currency}
          {currencyMismatch ? " — " : ". "}
          {currencyMismatch && (
            <span className="text-loss">
              this lot is priced in {currency}, which won&apos;t match its
              valuation marks. Set Lot Currency to {company.operating_currency}{" "}
              to keep cost and FMV comparable.
            </span>
          )}
        </p>
      )}
      <Field label={`Transaction FX → ${fund?.currency ?? "fund"} *`}>
        <input
          name="fx"
          type="number"
          step="any"
          required
          defaultValue={lot.fx_rate_at_entry}
          className={inputClass}
        />
      </Field>
      <Field label="Ownership % at Entry">
        <input
          name="ownership"
          type="number"
          step="any"
          defaultValue={lot.ownership_at_entry_pct ?? ""}
          className={inputClass}
        />
      </Field>
      <Field label="Status">
        <select name="status" defaultValue={lot.status} className={inputClass}>
          <SelectOptions
            values={["active", "partial_exit", "full_exit", "written_off"] as LotStatus[]}
          />
        </select>
      </Field>
      <Submit label="Save Changes" saving={saving} />
    </form>
  );
}
