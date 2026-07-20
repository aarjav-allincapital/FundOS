"use client";

import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDate, formatMoney } from "@/lib/calc";
import type {
  FundTimelineEvent,
  FundTimelineEventKind,
  FundTimelinePoint,
} from "@/lib/calc/trends";

const JAKARTA = "var(--font-jakarta), 'Plus Jakarta Sans', system-ui, sans-serif";

const EVENT_COLORS: Record<FundTimelineEventKind, string> = {
  investment: "#0A0A0A",
  mark: "#5B6C8C",
  exit: "#8B4A3A",
};

const SERIES_COLORS = {
  nav: "#0A0A0A",
  deployed: "#8A8A8A",
};

interface ChartRow {
  date: string;
  nav: number | null;
  deployed: number | null;
  investment: number | null;
  mark: number | null;
  exit: number | null;
  eventLabel?: string;
}

/**
 * Multi-line fund timeline: NAV + cumulative deployed, with event dots for
 * investments, valuation marks, and exits.
 */
export function MultiLineTimeline({
  series,
  events,
  height = 160,
  currency,
}: {
  series: FundTimelinePoint[];
  events: FundTimelineEvent[];
  height?: number;
  currency: string;
}) {
  if (series.length === 0) {
    return (
      <p className="px-1 py-6 text-center text-2xs text-ink-faint">
        No timeline data yet — add investments or marks.
      </p>
    );
  }

  // Map date → nav for placing event dots on the NAV line.
  const navByDate = new Map(series.map((p) => [p.date, p.nav]));
  const nearestNav = (date: string): number => {
    if (navByDate.has(date)) return navByDate.get(date)!;
    let best = series[0]?.nav ?? 0;
    for (const p of series) {
      if (p.date <= date) best = p.nav;
      else break;
    }
    return best;
  };

  const rowsByDate = new Map<string, ChartRow>();
  for (const p of series) {
    rowsByDate.set(p.date, {
      date: p.date,
      nav: p.nav,
      deployed: p.deployed,
      investment: null,
      mark: null,
      exit: null,
    });
  }

  for (const e of events) {
    let row = rowsByDate.get(e.date);
    if (!row) {
      row = {
        date: e.date,
        nav: nearestNav(e.date),
        deployed: null,
        investment: null,
        mark: null,
        exit: null,
      };
      rowsByDate.set(e.date, row);
    }
    const y = nearestNav(e.date);
    row[e.kind] = y;
    row.eventLabel = e.label;
  }

  const data = Array.from(rowsByDate.values()).sort((a, b) =>
    a.date < b.date ? -1 : 1,
  );

  // Forward-fill deployed so the line is continuous across event-only dates.
  let lastDeployed: number | null = null;
  let lastNav: number | null = null;
  for (const row of data) {
    if (row.deployed != null) lastDeployed = row.deployed;
    else row.deployed = lastDeployed;
    if (row.nav != null) lastNav = row.nav;
    else row.nav = lastNav;
  }

  const money = (v: number) => formatMoney(v, currency, { compact: true });

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#E7E7E7" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "#8A8A8A", fontFamily: JAKARTA }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={28}
            tickFormatter={(v: string) => formatDate(v, "short")}
          />
          <YAxis
            hide
            domain={["dataMin", "dataMax"]}
          />
          <Tooltip
            cursor={{ stroke: "#D4D4D4", strokeWidth: 1 }}
            contentStyle={{
              borderRadius: 6,
              border: "1px solid #E7E7E7",
              fontSize: 12,
              fontFamily: JAKARTA,
              padding: "6px 8px",
              boxShadow: "0 8px 24px -6px rgba(10,10,10,0.12)",
            }}
            labelStyle={{
              color: "#8A8A8A",
              fontSize: 10,
              marginBottom: 2,
              fontFamily: JAKARTA,
            }}
            labelFormatter={(label: string) => formatDate(label, "medium")}
            formatter={(value: number, name: string) => {
              if (value == null) return ["—", name];
              const labels: Record<string, string> = {
                nav: "NAV",
                deployed: "Deployed",
                investment: "Investment",
                mark: "Valuation mark",
                exit: "Exit",
              };
              return [money(value), labels[name] ?? name];
            }}
          />
          <Legend
            verticalAlign="top"
            align="right"
            iconType="plainline"
            iconSize={10}
            wrapperStyle={{
              fontSize: 10,
              fontFamily: JAKARTA,
              color: "#8A8A8A",
              paddingBottom: 4,
            }}
            formatter={(value: string) => {
              const labels: Record<string, string> = {
                nav: "NAV",
                deployed: "Deployed",
                investment: "Investment",
                mark: "Mark",
                exit: "Exit",
              };
              return labels[value] ?? value;
            }}
          />
          <Line
            type="monotone"
            dataKey="nav"
            name="nav"
            stroke={SERIES_COLORS.nav}
            strokeWidth={1.75}
            dot={false}
            activeDot={{ r: 3, fill: SERIES_COLORS.nav }}
            connectNulls
          />
          <Line
            type="stepAfter"
            dataKey="deployed"
            name="deployed"
            stroke={SERIES_COLORS.deployed}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            dot={false}
            activeDot={{ r: 3, fill: SERIES_COLORS.deployed }}
            connectNulls
          />
          <Scatter
            dataKey="investment"
            name="investment"
            fill={EVENT_COLORS.investment}
            shape="circle"
            legendType="circle"
          />
          <Scatter
            dataKey="mark"
            name="mark"
            fill={EVENT_COLORS.mark}
            shape="diamond"
            legendType="diamond"
          />
          <Scatter
            dataKey="exit"
            name="exit"
            fill={EVENT_COLORS.exit}
            shape="triangle"
            legendType="triangle"
          />
        </ComposedChart>
      </ResponsiveContainer>

      {events.length > 0 && (
        <ul className="mt-2 max-h-28 space-y-1 overflow-y-auto border-t border-line px-1 pt-2">
          {events
            .slice()
            .reverse()
            .slice(0, 8)
            .map((e, i) => (
              <li
                key={`${e.kind}-${e.date}-${e.company}-${i}`}
                className="flex items-center gap-2 text-2xs text-ink-muted"
              >
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: EVENT_COLORS[e.kind] }}
                />
                <span className="tnum shrink-0 text-ink-faint">
                  {formatDate(e.date, "medium")}
                </span>
                <span className="truncate text-ink">{e.label}</span>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
