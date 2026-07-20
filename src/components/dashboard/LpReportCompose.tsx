"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FundOSData } from "@/lib/types";
import {
  allFundMetrics,
  fundIrr,
  formatMoney,
  formatMultiple,
  formatPercent,
} from "@/lib/calc";
import { downloadLpExcel, openLpUpdatePdf } from "@/lib/reporting/lp-export";
import {
  LP_SECTIONS,
  buildDraftHtml,
  copyLpEmail,
  newDraft,
  openMailto,
  sendLpEmail,
  todayIso,
  type LpEmailDraft,
  type LpSectionId,
} from "@/lib/reporting/lp-email";
import { Panel, PanelHeader, PanelBody } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import {
  Check,
  Copy,
  FileDown,
  FileSpreadsheet,
  Mail,
  Plus,
  RotateCcw,
  Send,
  X,
} from "lucide-react";

const DEFAULT_SECTIONS: LpSectionId[] = LP_SECTIONS.filter((s) => s.recommended).map(
  (s) => s.id,
);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type SendState =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; id: string | null }
  | { kind: "error"; message: string };

/**
 * Reporting compose view — pick fund + sections, edit the branded update, and
 * send it to LPs in one click (Resend), download a matching PDF/Excel, or copy.
 */
export function LpReportCompose({ data }: { data: FundOSData }) {
  const funds = allFundMetrics(data);
  const asOf = useMemo(() => todayIso(), []);

  const [draft, setDraft] = useState<LpEmailDraft>(() =>
    newDraft(data, { fundId: "all", asOf, sections: DEFAULT_SECTIONS }),
  );
  const [editedFields, setEditedFields] = useState({ subject: false, intro: false });
  const [recipientInput, setRecipientInput] = useState("");
  const [copied, setCopied] = useState(false);
  const [send, setSend] = useState<SendState>({ kind: "idle" });
  const [exportError, setExportError] = useState<string | null>(null);

  const sections = useMemo(() => new Set(draft.sections), [draft.sections]);

  // Re-prefill subject/intro when fund or sections change, unless user edited them.
  useEffect(() => {
    const base = newDraft(data, {
      fundId: draft.fundId,
      asOf,
      sections: draft.sections,
    });
    setDraft((d) => ({
      ...d,
      subject: editedFields.subject ? d.subject : base.subject,
      intro: editedFields.intro ? d.intro : base.intro,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.fundId, data, asOf]);

  function setFund(fundId: string) {
    setDraft((d) => ({ ...d, fundId }));
  }

  function toggleSection(id: LpSectionId) {
    setDraft((d) => {
      const set = new Set(d.sections);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      const next = LP_SECTIONS.map((s) => s.id).filter((sid) => set.has(sid));
      return { ...d, sections: next };
    });
  }

  function commitRecipient(raw: string) {
    const parts = raw
      .split(/[,\s;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    setDraft((d) => {
      const set = new Set(d.to);
      for (const p of parts) set.add(p);
      return { ...d, to: [...set] };
    });
    setRecipientInput("");
    setSend({ kind: "idle" });
  }

  function removeRecipient(email: string) {
    setDraft((d) => ({ ...d, to: d.to.filter((e) => e !== email) }));
  }

  function resetTemplate() {
    setDraft((d) => {
      const base = newDraft(data, { fundId: d.fundId, asOf, sections: d.sections });
      return { ...base, to: d.to };
    });
    setEditedFields({ subject: false, intro: false });
    setSend({ kind: "idle" });
  }

  function runExport(fn: () => void) {
    setExportError(null);
    try {
      fn();
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Export failed.");
    }
  }

  async function handleCopy() {
    try {
      await copyLpEmail(data, draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setExportError("Could not copy to clipboard.");
    }
  }

  async function handleSend() {
    if (draft.sections.length === 0) {
      setSend({ kind: "error", message: "Select at least one section to include." });
      return;
    }
    if (draft.to.length === 0) {
      setSend({ kind: "error", message: "Add at least one recipient." });
      return;
    }
    setSend({ kind: "sending" });
    const res = await sendLpEmail(data, draft);
    if (res.ok) setSend({ kind: "sent", id: res.id });
    else setSend({ kind: "error", message: res.error });
  }

  const previewHtml = useMemo(() => buildDraftHtml(data, draft), [data, draft]);
  const previewMetrics = funds.filter((m) => draft.fundId === "all" || m.fund.id === draft.fundId);
  const approvedMarks = data.valuationMarks.filter((m) => m.approval_status === "approved").length;
  const pendingMarks = data.valuationMarks.length - approvedMarks;
  const invalidRecipients = draft.to.filter((e) => !EMAIL_RE.test(e));

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      {/* Left: audience + selection + snapshot */}
      <div className="flex flex-col gap-4 lg:col-span-2">
        <Panel>
          <PanelHeader
            title="Recipients"
            subtitle="Who receives this update"
            action={<Badge tone="neutral">{draft.to.length} LP</Badge>}
          />
          <PanelBody className="flex flex-col gap-2.5">
            <div className="flex flex-wrap gap-1.5">
              {draft.to.map((email) => {
                const bad = !EMAIL_RE.test(email);
                return (
                  <span
                    key={email}
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs ${
                      bad
                        ? "border-loss/40 bg-loss/5 text-loss"
                        : "border-line bg-surface-subtle text-ink"
                    }`}
                  >
                    {email}
                    <button
                      type="button"
                      onClick={() => removeRecipient(email)}
                      className="text-ink-faint hover:text-ink"
                      aria-label={`Remove ${email}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                );
              })}
              {draft.to.length === 0 && (
                <span className="text-2xs text-ink-faint">No recipients yet.</span>
              )}
            </div>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={recipientInput}
                onChange={(e) => setRecipientInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    commitRecipient(recipientInput);
                  }
                }}
                onBlur={() => recipientInput.trim() && commitRecipient(recipientInput)}
                placeholder="lp@example.com  (Enter to add)"
                className="h-8 w-full rounded border border-line bg-surface px-2.5 text-[13px] text-ink outline-none placeholder:text-ink-faint focus:border-line-strong"
              />
              <button
                type="button"
                onClick={() => commitRecipient(recipientInput)}
                className="inline-flex h-8 shrink-0 items-center gap-1 rounded border border-line px-2.5 text-2xs font-medium text-ink-muted hover:border-line-strong hover:text-ink"
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </button>
            </div>
            {invalidRecipients.length > 0 && (
              <p className="text-2xs text-loss">
                Check highlighted address{invalidRecipients.length > 1 ? "es" : ""}.
              </p>
            )}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader
            title="What to include"
            subtitle="Recommended sections are pre-selected"
            action={
              <Badge tone={pendingMarks ? "warn" : "gain"}>
                {pendingMarks ? `${pendingMarks} marks pending` : "Marks ready"}
              </Badge>
            }
          />
          <PanelBody className="flex flex-col gap-4">
            <div>
              <label className="mb-1.5 block text-2xs font-medium uppercase tracking-wide text-ink-faint">
                Fund
              </label>
              <div
                role="radiogroup"
                aria-label="Fund"
                className="grid grid-cols-3 gap-1.5"
              >
                <FundPick
                  selected={draft.fundId === "all"}
                  label="All funds"
                  hint="Combined"
                  onClick={() => setFund("all")}
                />
                {funds.map((f) => {
                  const n =
                    f.fund.vehicle_code === "F1"
                      ? "1"
                      : f.fund.vehicle_code === "F2"
                        ? "2"
                        : f.fund.vehicle_code.replace(/^F/i, "") || f.fund.code;
                  return (
                    <FundPick
                      key={f.fund.id}
                      selected={draft.fundId === f.fund.id}
                      label={`Fund ${n}`}
                      hint={f.fund.code}
                      onClick={() => setFund(f.fund.id)}
                    />
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              {LP_SECTIONS.map((s) => {
                const on = sections.has(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleSection(s.id)}
                    className={`flex items-start gap-2.5 rounded border px-3 py-2 text-left transition-colors ${
                      on
                        ? "border-ink/20 bg-surface-subtle"
                        : "border-line hover:border-line-strong"
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
                        on ? "border-ink bg-ink text-surface" : "border-line-strong bg-surface"
                      }`}
                    >
                      {on && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
                        {s.label}
                        {s.recommended && (
                          <span className="rounded bg-brand-red/10 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-brand-red">
                            Rec
                          </span>
                        )}
                      </span>
                      <span className="block text-2xs text-ink-muted">{s.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Snapshot" subtitle={`As of ${asOf}`} />
          <div className="divide-y divide-line">
            {previewMetrics.length === 0 && (
              <p className="px-4 py-3 text-2xs text-ink-faint">No funds.</p>
            )}
            {previewMetrics.map((m) => {
              const { grossIrr, netIrr } = fundIrr(data, m.fund);
              return (
                <div key={m.fund.id} className="grid grid-cols-2 gap-3 px-4 py-3">
                  <div className="col-span-2 text-[13px] font-semibold text-ink">
                    {m.fund.code}
                    <span className="ml-1.5 font-normal text-ink-muted">{m.fund.name}</span>
                  </div>
                  <MiniKpi label="NAV" value={formatMoney(m.currentNav, m.currency, { compact: true })} />
                  <MiniKpi label="Deployed" value={formatMoney(m.deployedCost, m.currency, { compact: true })} />
                  <MiniKpi label="Gross MOIC" value={formatMultiple(m.grossMoic)} />
                  <MiniKpi label="DPI" value={formatMultiple(m.dpi)} />
                  <MiniKpi label="Gross IRR" value={formatPercent(grossIrr, { fraction: true })} />
                  <MiniKpi label="Net IRR" value={formatPercent(netIrr, { fraction: true })} />
                </div>
              );
            })}
          </div>
        </Panel>
      </div>

      {/* Right: compose + live preview */}
      <div className="lg:col-span-3">
        <Panel className="flex h-full flex-col">
          <PanelHeader
            title="LP update email"
            subtitle="Edit and preview exactly what LPs receive"
            action={
              <button
                type="button"
                onClick={resetTemplate}
                className="inline-flex items-center gap-1 rounded border border-line px-2 py-1 text-2xs font-medium text-ink-muted hover:border-line-strong hover:text-ink"
              >
                <RotateCcw className="h-3 w-3" />
                Reset text
              </button>
            }
          />
          <PanelBody className="flex flex-1 flex-col gap-3">
            <div>
              <label className="mb-1 block text-2xs font-medium uppercase tracking-wide text-ink-faint">
                Subject
              </label>
              <input
                type="text"
                value={draft.subject}
                onChange={(e) => {
                  setEditedFields((f) => ({ ...f, subject: true }));
                  setDraft((d) => ({ ...d, subject: e.target.value }));
                }}
                className="h-8 w-full rounded border border-line bg-surface px-2.5 text-[13px] font-medium text-ink outline-none focus:border-line-strong"
              />
            </div>

            <div>
              <label className="mb-1 block text-2xs font-medium uppercase tracking-wide text-ink-faint">
                Intro message
              </label>
              <textarea
                value={draft.intro}
                onChange={(e) => {
                  setEditedFields((f) => ({ ...f, intro: true }));
                  setDraft((d) => ({ ...d, intro: e.target.value }));
                }}
                rows={5}
                spellCheck
                className="w-full resize-none rounded border border-line bg-surface px-2.5 py-2 text-[13px] leading-[1.6] text-ink outline-none focus:border-line-strong"
              />
              <p className="mt-1 text-2xs text-ink-faint">
                Fund metrics, holdings and realizations are appended automatically from your selections.
              </p>
            </div>

            <div>
              <label className="mb-1 block text-2xs font-medium uppercase tracking-wide text-ink-faint">
                Preview
              </label>
              <iframe
                title="Email preview"
                srcDoc={previewHtml}
                sandbox="allow-same-origin"
                className="h-[420px] w-full rounded-lg border border-line bg-white"
              />
            </div>

            {send.kind === "sent" && (
              <p className="rounded border border-gain/30 bg-gain/5 px-3 py-2 text-2xs text-gain">
                Sent to {draft.to.length} recipient{draft.to.length > 1 ? "s" : ""}.
                {send.id ? ` (id ${send.id})` : ""}
              </p>
            )}
            {send.kind === "error" && (
              <p className="rounded border border-loss/30 bg-loss/5 px-3 py-2 text-2xs text-loss">
                {send.message}
              </p>
            )}
            {exportError && <p className="text-2xs text-loss">{exportError}</p>}

            <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-line pt-3">
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={send.kind === "sending"}
                className="inline-flex items-center gap-1.5 rounded bg-brand-red px-3.5 py-1.5 text-2xs font-semibold text-white hover:bg-brand-red/90 disabled:opacity-60"
              >
                <Send className="h-3.5 w-3.5" />
                {send.kind === "sending" ? "Sending…" : "Send to LPs"}
              </button>
              <button
                type="button"
                onClick={() => runExport(() =>
                  openLpUpdatePdf(data, {
                    fundId: draft.fundId,
                    sections: draft.sections,
                    asOf: draft.asOf,
                    intro: draft.intro,
                    signoff: draft.signoff,
                  }),
                )}
                className="inline-flex items-center gap-1.5 rounded border border-line px-3 py-1.5 text-2xs font-medium text-ink-muted hover:border-line-strong hover:text-ink"
              >
                <FileDown className="h-3.5 w-3.5" />
                PDF
              </button>
              <button
                type="button"
                onClick={() => runExport(() => downloadLpExcel(data))}
                className="inline-flex items-center gap-1.5 rounded border border-line px-3 py-1.5 text-2xs font-medium text-ink-muted hover:border-line-strong hover:text-ink"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                Excel
              </button>
              <span className="mx-1 hidden h-4 w-px bg-line sm:inline-block" />
              <button
                type="button"
                onClick={() => runExport(() => openMailto(data, draft))}
                className="inline-flex items-center gap-1.5 rounded border border-line px-3 py-1.5 text-2xs font-medium text-ink-muted hover:border-line-strong hover:text-ink"
              >
                <Mail className="h-3.5 w-3.5" />
                Mail app
              </button>
              <button
                type="button"
                onClick={() => void handleCopy()}
                className="inline-flex items-center gap-1.5 rounded border border-line px-3 py-1.5 text-2xs font-medium text-ink-muted hover:border-line-strong hover:text-ink"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}

function FundPick({
  selected,
  label,
  hint,
  onClick,
}: {
  selected: boolean;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={`rounded border px-2 py-2 text-center transition-colors ${
        selected
          ? "border-ink bg-ink text-surface"
          : "border-line bg-surface text-ink hover:border-line-strong"
      }`}
    >
      <span className="block text-[12px] font-semibold leading-tight">{label}</span>
      <span
        className={`mt-0.5 block text-[10px] leading-tight ${
          selected ? "text-surface/70" : "text-ink-faint"
        }`}
      >
        {hint}
      </span>
    </button>
  );
}

function MiniKpi({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-2xs uppercase tracking-wide text-ink-faint">{label}</div>
      <div className="tnum text-sm font-semibold text-ink">{value}</div>
    </div>
  );
}
