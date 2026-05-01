"use client";

export function TableView({
  rows, onSelect, selection,
}: {
  rows: Array<{ id: string; type: string; properties: Record<string, unknown> }>;
  onSelect: (id: string) => void;
  selection: string[];
}) {
  if (rows.length === 0) {
    return <div className="p-6 text-sm text-chrome-500">No rows. Use Cmd-K to ask a question.</div>;
  }
  const cols = uniqueColumns(rows).slice(0, 8);
  return (
    <div className="h-full overflow-auto">
      <table className="w-full table-auto text-sm">
        <thead className="sticky top-0 bg-navy-800 text-chrome-300">
          <tr>
            <th className="border-b border-chrome-700 px-3 py-2 text-left">Type</th>
            {cols.map(c => (
              <th key={c} className="border-b border-chrome-700 px-3 py-2 text-left">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr
              key={r.id}
              onClick={() => onSelect(r.id)}
              className={`cursor-pointer border-b border-chrome-700/50 hover:bg-navy-700/40 ${
                selection.includes(r.id) ? "bg-navy-700" : ""
              }`}
            >
              <td className="px-3 py-2 text-cyan-signal">{r.type}</td>
              {cols.map(c => (
                <td key={c} className="px-3 py-2 text-chrome-100">{format(r.properties[c])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const uniqueColumns = (rows: Array<{ properties: Record<string, unknown> }>): string[] => {
  const set = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r.properties)) set.add(k);
  return Array.from(set);
};

const format = (v: unknown): string => {
  if (v == null) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
};
