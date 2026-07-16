# Fix partial-exit accounting + FX/orphan safety; add Gross/Net IRR

> Copy the section below into the PR body when opening
> https://github.com/r-shar99/FundOS/pull/new/fix/irr-and-exit-accounting
> (this file can be deleted after the PR is created).

---

## Summary

Fixes four correctness bugs in LP-facing fund metrics and adds a Gross/Net IRR
mechanism. All financials stay derived from base tables — no hand-edited totals.

## Correctness fixes

- **Partial exit no longer corrupts DPI / TVPI / MOIC.** A partial exit was
  shrinking the denominator (`deployedCost`) along with the remaining position,
  overstating returns (e.g. sell 40% of a ₹100k position for ₹80k → DPI showed
  1.33× instead of 0.8×). Added an immutable `paid_in_capital_fund` on lots;
  `fundMetrics.deployedCost` now uses total paid-in capital.
- **Missing cross-currency FX resolves to `NaN` (renders as "—"), not a silent
  1.0.** Previously a missing rate misstated totals by the entire FX magnitude
  (~83× for INR/USD).
- **Company valuation marks now reprice `partial_exit` lots** — their NAV no
  longer freezes at the exit-date mark.
- **`buildLotPosition` returns `null` on an orphaned fund/company** instead of
  throwing and crashing the entire portfolio derivation.

## Features

- **Gross & Net IRR** (`src/lib/calc/irr.ts`): XIRR (Newton-Raphson with a
  bisection fallback, actual/365) over dated fund cash flows — contributions at
  each investment date, realizations at each realization date, plus current NAV
  as a residual inflow.
- **Net IRR** uses a **configurable fee/carry model**: annual management fees
  (on deployed or committed capital) plus carried interest over a preferred/hurdle
  return. Surfaced on the fund cards and in the reporting view.
- **Editable fund economics** via `updateFund` + a new `"fund"` edit-modal mode
  (fee %, fee basis, carry %, hurdle %, committed capital).

## Tests

`scripts/sim4–6.ts` cover: partial-exit DPI/TVPI, missing-FX NaN, mark refresh
on partial-exit lots, orphan safety, XIRR against known returns, net-vs-gross
behavior, and editable economics flowing into Net IRR. Full suite: **87/87**.
Typecheck clean, production build compiles, verified live in the browser.

## ⚠️ Note on Net IRR

Net IRR here is a **modeled approximation** (configurable fee/carry, European-
waterfall style) — not booked fees from a real capital-account waterfall. Good
for internal/portfolio views; **not yet an audited LP figure**.
