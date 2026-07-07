"use client";

import { useEffect, useState, useCallback } from "react";
import { Bell, Trash2, Sparkles, Clock } from "lucide-react";
import { Wordmark } from "@/components/Wordmark";

type Watch = {
  id: string; name: string; knownFacts: Record<string, any>;
  lastSweptAt: string | null; createdAt: string;
};
type Finding = {
  id: string; watchId: string; summary: string; source: string;
  seen: string; createdAt: string;
};

export default function WatchlistPage() {
  const [watches, setWatches] = useState<Watch[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [w, f] = await Promise.all([
      fetch("/api/watchlist").then(r => r.json()),
      fetch("/api/watchlist/findings").then(r => r.json()),
    ]);
    setWatches(w.watches ?? []);
    setFindings(f.findings ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const remove = useCallback(async (id: string) => {
    setWatches(w => w.filter(x => x.id !== id));
    await fetch("/api/watchlist", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
  }, []);

  const dismiss = useCallback(async (id: string) => {
    setFindings(f => f.filter(x => x.id !== id));
    await fetch("/api/watchlist/findings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
  }, []);

  const byWatch = (id: string) => findings.filter(f => f.watchId === id);
  const unseen = findings.filter(f => f.seen === "false");

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <Wordmark />
        <a href="/person" className="text-xs text-chrome-500 hover:text-chrome-100">← Person search</a>
      </div>

      <h1 className="mb-1 flex items-center gap-2 text-2xl text-chrome-50">
        <Bell size={20} className="text-amber-alert" /> Watchlist
        {unseen.length > 0 && (
          <span className="rounded-full bg-amber-alert px-2 py-0.5 text-xs text-navy">{unseen.length} new</span>
        )}
      </h1>
      <p className="mb-5 text-sm text-chrome-500">
        People you're monitoring. A scheduled sweep re-checks every source daily and lists
        anything new below. Add someone from the <a href="/person" className="text-cyan-signal hover:underline">search page</a>.
      </p>

      {loading && <div className="text-sm text-chrome-500">Loading…</div>}
      {!loading && watches.length === 0 && (
        <div className="rounded-lg border border-chrome-700 bg-navy-800 p-6 text-sm text-chrome-500">
          Nobody on your watchlist yet. Search a name and click <strong>Watch &amp; notify</strong>.
        </div>
      )}

      <ul className="space-y-3">
        {watches.map(w => {
          const items = byWatch(w.id);
          return (
            <li key={w.id} className="rounded-lg border border-chrome-700 bg-navy-800 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-chrome-50">{w.name}</div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-chrome-500">
                    {Object.entries(w.knownFacts).filter(([, v]) => v).map(([k, v]) => (
                      <span key={k}>{k}: {String(v)}</span>
                    ))}
                    <span className="flex items-center gap-1"><Clock size={10} />
                      {w.lastSweptAt ? `checked ${new Date(w.lastSweptAt).toLocaleDateString()}` : "not yet checked"}
                    </span>
                  </div>
                </div>
                <button onClick={() => remove(w.id)} className="text-chrome-600 hover:text-red-400"><Trash2 size={15} /></button>
              </div>

              {items.length > 0 && (
                <ul className="mt-3 space-y-1 border-t border-chrome-700 pt-3">
                  {items.map(f => (
                    <li key={f.id} className="flex items-center justify-between rounded px-2 py-1 text-sm hover:bg-navy-700">
                      <span className="flex items-center gap-2">
                        {f.seen === "false" && <Sparkles size={13} className="text-amber-alert" />}
                        <span className="text-chrome-100">{f.summary}</span>
                      </span>
                      <button onClick={() => dismiss(f.id)} className="text-xs text-chrome-500 hover:text-chrome-100">dismiss</button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
