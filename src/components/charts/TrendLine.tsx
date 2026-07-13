"use client";

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface TrendPoint {
  label: string;
  value: number;
}

const JAKARTA = "var(--font-jakarta), 'Plus Jakarta Sans', system-ui, sans-serif";

/**
 * Minimal area trend. Monochrome ink stroke, faint fill. Used for NAV / value
 * trends where the shape matters more than gridlines.
 */
export function TrendLine({
  data,
  height = 64,
  color = "#0A0A0A",
  showAxis = false,
  valueFormatter,
}: {
  data: TrendPoint[];
  height?: number;
  color?: string;
  showAxis?: boolean;
  valueFormatter?: (v: number) => string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={`grad-${color}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.12} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {showAxis && (
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: "#8A8A8A", fontFamily: JAKARTA }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
        )}
        {showAxis && (
          <YAxis
            hide
            domain={["dataMin", "dataMax"]}
          />
        )}
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
          labelStyle={{ color: "#8A8A8A", fontSize: 10, marginBottom: 2, fontFamily: JAKARTA }}
          formatter={(v: number) => [
            valueFormatter ? valueFormatter(v) : v.toLocaleString(),
            "",
          ]}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={1.75}
          fill={`url(#grad-${color})`}
          dot={false}
          activeDot={{ r: 3, fill: color }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
