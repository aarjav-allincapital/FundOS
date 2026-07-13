# FundOS — All In Capital

Venture capital operating system for All In Capital. Manage funds, portfolio companies, investment lots, valuations, exits, FX, and deal pipeline in one institutional-grade workspace.

**Repo:** [aarjav-allincapital/FundOS](https://github.com/aarjav-allincapital/FundOS)

---

## Features

- **Command Center** — portfolio NAV, deployed capital, MOIC, and recent activity
- **Multi-fund** — Fund 1 (USD) and Fund 2 (INR) with display currency toggle
- **Investment lots** — entry cost from shares × price, transaction FX, ownership
- **Valuation marks** — mark-to-market snapshots across active lots
- **Exits** — full, partial, and write-off with DPI / realized proceeds
- **Live FX** — reporting rates via Frankfurter (no hardcoded bootstrap FX)
- **Deal pipeline** — sourcing through closing stages
- **Local-first** — data persists in the browser; Supabase schema ready when you connect

---

## Stack

| Layer | Choice |
|--------|--------|
| App | Next.js (App Router) + TypeScript |
| UI | Tailwind CSS + Recharts + Lucide |
| Data (dev) | localStorage + seed/bootstrap |
| Data (prod-ready) | Supabase / Postgres migrations |
| FX | Frankfurter API (`/api/fx`) |

---

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Serve production build |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm run sim` | Calculation / mutation simulations (65 checks) |

---

## Project structure

```
src/
  app/                 App Router pages + API (FX)
  components/
    dashboard/         Portfolio widgets & tables
    forms/             Add / edit / delete record flows
    layout/            Sidebar, topbar, shell
    ui/                Design system primitives
    charts/            Trend & allocation charts
  lib/
    calc/              NAV, MOIC, FX, snapshots (single math engine)
    data/              Mutations, updates, deletes, storage, seed
    fx/                Live FX fetch & display refresh
    types.ts           Schema-aligned TypeScript types
  providers/           FundOS + display preferences context
supabase/migrations/   Postgres source of truth
public/                Brand assets (e.g. All In logo)
scripts/               sim.ts, sim2.ts, sim3.ts
```

---

## How valuation works

1. **Lots** record cash invested (shares × entry price) and lock transaction FX at entry.
2. **Valuation marks** reprice company lots and create/update position snapshots.
3. **NAV / MOIC / trends** are derived only from lots, marks, snapshots, FX, and realizations — never hand-edited totals.
4. **Display currency** converts using today’s reporting FX (live), separate from entry FX.

---

## Environment (optional Supabase)

Copy `.env.example` when present, or set:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Apply migrations under `supabase/migrations/`, then wire live queries in `src/lib/data/repository.ts`. Row shapes match `src/lib/types.ts`.

Without Supabase, the app runs fully on local bootstrap/seed data.

---

## Design notes

- Institutional look: light surface, dark type, color reserved for gain / loss / warn / pending
- Numbers use tabular figures; currency display respects fund and company operating currencies
- Keyboard: **Ctrl/Cmd+K** opens Add Record

---

## License

Private — All In Capital. All rights reserved.
