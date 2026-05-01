"use client";

import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";

export type TimelinePoint = { id: string; label: string; type: string; t: number };

export function TimelineView({ points, onSelect }: { points: TimelinePoint[]; onSelect: (id: string) => void }) {
  if (points.length === 0) {
    return <div className="p-6 text-sm text-chrome-500">No temporal events in this selection.</div>;
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={{ top: 16, right: 16, left: 0, bottom: 16 }}>
        <CartesianGrid stroke="#1B2C4F" />
        <XAxis
          dataKey="t" type="number" domain={["dataMin", "dataMax"]}
          tickFormatter={(v: number) => new Date(v).getFullYear().toString()}
          stroke="#9AA3B2"
        />
        <YAxis dataKey="type" type="category" stroke="#9AA3B2" width={120} />
        <Tooltip
          contentStyle={{ background: "#0F1828", border: "1px solid #3DD9D6", color: "#E6EAF2" }}
          formatter={(_v, _n, p: any) => [p.payload.label, p.payload.type]}
          labelFormatter={v => new Date(v as number).toISOString().slice(0, 10)}
        />
        <Scatter data={points} fill="#3DD9D6" onClick={(p: any) => onSelect(p.id)} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}
