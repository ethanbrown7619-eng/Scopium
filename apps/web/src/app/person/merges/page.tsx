"use client";

import { useEffect, useState, useCallback } from "react";
import { Check, X, GitMerge } from "lucide-react";
import { Wordmark } from "@/components/Wordmark";

type Merge = {
  id: string;
  from_name: string; to_name: string;
  from_locality?: string; to_locality?: string;
  properties: { confidence: number; signals: string[]; method: string };
};

export default function MergesPage() {
  const [merges, setMerges] = useState<Merge[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/people/merges");
    const data = await res.json();
    setMerges(data.merges ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const decide = useCallback(async (linkId: string, status: "confirmed" | "rejected") => {
    setMerges(m => m.filter(x => x.id !== linkId)); // optimistic
    await fetch("/api/people/merges", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ linkId, status }),
    });
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <Wordmark />
        <a href="/person" className="text-xs text-chrome-500 hover:text-chrome-100">← Person search</a>
      </div>

      <h1 className="mb-1 flex items-center gap-2 text-2xl text-chrome-50">
        <GitMerge size={20} className="text-cyan-signal" /> Review candidate merges
      </h1>
      <p className="mb-5 text-sm text-chrome-500">
        These pairs might be the same person — confirm or reject. Auto-merges (exact name + DOB)
        are applied silently; only ambiguous matches land here, so a wrong merge never happens without review.
      </p>

      {loading && <div className="text-sm text-chrome-500">Loading…</div>}
      {!loading && merges.length === 0 && (
        <div className="rounded-lg border border-chrome-700 bg-navy-800 p-6 text-sm text-chrome-500">
          No candidate merges to review. Run a sweep or seed to generate more.
        </div>
      )}

      <ul className="space-y-2">
        {merges.map(m => (
          <li key={m.id} className="rounded-lg border border-chrome-700 bg-navy-800 p-4">
            <div className="flex items-center justify-between">
              <div className="grid flex-1 grid-cols-[1fr_auto_1fr] items-center gap-3">
                <Candidate name={m.from_name} locality={m.from_locality} />
                <span className="text-xs text-chrome-500">≟</span>
                <Candidate name={m.to_name} locality={m.to_locality} align="right" />
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs">
                <span className="rounded bg-amber-alert/10 px-2 py-0.5 text-amber-alert">
                  {Math.round((m.properties.confidence ?? 0) * 100)}% confidence
                </span>
                {(m.properties.signals ?? []).map(s => (
                  <span key={s} className="rounded bg-navy-700 px-2 py-0.5 text-chrome-400">{s}</span>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={() => decide(m.id, "rejected")}
                  className="flex items-center gap-1 rounded border border-chrome-700 px-3 py-1 text-xs text-chrome-300 hover:border-red-400 hover:text-red-400">
                  <X size={13} /> Not same
                </button>
                <button onClick={() => decide(m.id, "confirmed")}
                  className="flex items-center gap-1 rounded bg-cyan-signal/15 px-3 py-1 text-xs text-cyan-signal hover:bg-cyan-signal/25">
                  <Check size={13} /> Same person
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Candidate({ name, locality, align }: { name: string; locality?: string; align?: "right" }) {
  return (
    <div className={align === "right" ? "text-right" : ""}>
      <div className="text-chrome-100">{name}</div>
      {locality && <div className="text-xs text-chrome-500">{locality}</div>}
    </div>
  );
}
