"use client";

import { useEffect, useState } from "react";
import { ChevronRight, ExternalLink } from "lucide-react";

type Detail = {
  object: { id: string; type: string; classification: string; properties: Record<string, unknown>; provenance: any };
  links: Array<{ id: string; type: string; from_id: string; to_id: string; properties: Record<string, unknown> }>;
  neighbours: Array<{ id: string; type: string; properties: Record<string, unknown> }>;
};

export function DetailPanel({ id, onSelect }: { id?: string; onSelect: (id: string) => void }) {
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!id) { setData(null); return; }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/objects/${id}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setData(d); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  if (!id) {
    return <div className="p-6 text-sm text-chrome-500">Select an object to inspect it.</div>;
  }
  if (loading) return <div className="p-6 text-sm text-chrome-500">Loading…</div>;
  if (!data?.object) return <div className="p-6 text-sm text-chrome-500">Not found.</div>;

  const o = data.object;
  const incoming = data.links.filter(l => l.to_id === id);
  const outgoing = data.links.filter(l => l.from_id === id);
  const neighbour = (nid: string) => data.neighbours.find(n => n.id === nid);

  return (
    <div className="h-full overflow-y-auto p-4 text-sm">
      <div className="mb-4">
        <div className="text-xs uppercase tracking-wider text-cyan-signal">{o.type}</div>
        <div className="mt-1 text-base text-chrome-50">
          {String(o.properties.name ?? o.properties.fullName ?? o.properties.title ?? o.id)}
        </div>
        <div className="mt-1 text-xs text-chrome-500">id: {o.id}</div>
        <div className="mt-1 text-xs">
          <span className={`rounded px-1.5 py-0.5 ${
            o.classification === "Public" ? "bg-cyan-signal/10 text-cyan-signal" :
            o.classification === "Restricted" ? "bg-amber-alert/10 text-amber-alert" :
            "bg-red-500/10 text-red-400"
          }`}>{o.classification}</span>
        </div>
      </div>

      <Section title="Properties">
        <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1">
          {Object.entries(o.properties).map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-chrome-500">{k}</dt>
              <dd className="text-chrome-100 break-words">{format(v)}</dd>
            </div>
          ))}
        </dl>
      </Section>

      {outgoing.length > 0 && (
        <Section title={`Outgoing links (${outgoing.length})`}>
          {outgoing.map(l => (
            <button key={l.id} onClick={() => onSelect(l.to_id)}
              className="flex w-full items-center justify-between rounded px-2 py-1 hover:bg-navy-700">
              <span className="text-chrome-300">{l.type}</span>
              <span className="flex items-center gap-1 text-chrome-100">
                {label(neighbour(l.to_id))}
                <ChevronRight size={14} />
              </span>
            </button>
          ))}
        </Section>
      )}

      {incoming.length > 0 && (
        <Section title={`Incoming links (${incoming.length})`}>
          {incoming.map(l => (
            <button key={l.id} onClick={() => onSelect(l.from_id)}
              className="flex w-full items-center justify-between rounded px-2 py-1 hover:bg-navy-700">
              <span className="text-chrome-300">{l.type}</span>
              <span className="flex items-center gap-1 text-chrome-100">
                {label(neighbour(l.from_id))}
                <ChevronRight size={14} />
              </span>
            </button>
          ))}
        </Section>
      )}

      <Section title="Provenance">
        <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-chrome-500">connector</dt>
          <dd className="text-chrome-100">{o.provenance.connectorId} v{o.provenance.connectorVersion}</dd>
          <dt className="text-chrome-500">source id</dt>
          <dd className="text-chrome-100 break-all">{o.provenance.sourceId}</dd>
          {o.provenance.sourceUrl && (
            <>
              <dt className="text-chrome-500">source url</dt>
              <dd>
                <a href={o.provenance.sourceUrl} target="_blank" rel="noreferrer"
                   className="inline-flex items-center gap-1 text-cyan-signal hover:underline">
                  open <ExternalLink size={12} />
                </a>
              </dd>
            </>
          )}
          <dt className="text-chrome-500">synced at</dt>
          <dd className="text-chrome-100">{o.provenance.syncedAt}</dd>
        </dl>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-4 border-t border-chrome-700 pt-3">
      <h3 className="mb-2 text-xs uppercase tracking-wider text-chrome-500">{title}</h3>
      {children}
    </section>
  );
}

const format = (v: unknown): string => {
  if (v == null) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
};

const label = (n?: { type: string; properties: Record<string, unknown> }): string => {
  if (!n) return "—";
  return String(n.properties.name ?? n.properties.fullName ?? n.properties.title ?? n.type);
};
