"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

export interface DonutSlice {
  name: string;
  value: number;
  color: string;
}

/**
 * Compact allocation donut. Neutral palette (greyscale + one accent) to stay
 * within the institutional aesthetic.
 */
export function Donut({
  data,
  size = 128,
  thickness = 16,
  centerLabel,
  centerValue,
}: {
  data: DonutSlice[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={total > 0 ? data : [{ name: "empty", value: 1, color: "#F4F4F4" }]}
            dataKey="value"
            innerRadius={size / 2 - thickness}
            outerRadius={size / 2}
            paddingAngle={total > 0 ? 1.5 : 0}
            startAngle={90}
            endAngle={-270}
            stroke="none"
          >
            {(total > 0 ? data : [{ color: "#F4F4F4" }]).map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      {(centerLabel || centerValue) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {centerValue && (
            <span className="tnum text-sm font-semibold text-ink leading-none">
              {centerValue}
            </span>
          )}
          {centerLabel && (
            <span className="mt-0.5 text-2xs text-ink-faint">{centerLabel}</span>
          )}
        </div>
      )}
    </div>
  );
}
