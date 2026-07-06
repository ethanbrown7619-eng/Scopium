"use client";

import { useState, useCallback, Suspense } from "react";
import { Search, Loader2, Radar } from "lucide-react";
import { Wordmark } from "@/components/Wordmark";
import { PersonProfile } from "@/components/PersonProfile";

type PersonRow = { id: string; properties: Record<string, any>; provenance: any };

function PersonSearch() {
  const [name, setName] = useState("");
  const [results, setResults] = useState<PersonRow[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [status, setStatus] = useState<"idle" | "searching" | "sweeping" | "loading-profile">("idle");
  const [sweepReport, setSweepReport] = useState<any[] | null>(null);

  const search = useCallback(async () => {
    if (name.trim().length < 2) return;
    setStatus("searching"); setProfile(null); setSweepReport(null);
    const res = await fetch(`/api/people/search?q=${encodeURIComponent(name)}`);
    const data = await res.json();
    setResults(data.people ?? []);
    setStatus("idle");
  }, [name]);

  const sweep = useCallback(async () => {
    if (name.trim().length < 2) return;
    setStatus("sweeping"); setProfile(null);
    const res = await fetch("/api/people/sweep", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    setResults(data.people ?? []);
    setSweepReport(data.sourceResults ?? null);
    setStatus("idle");
  }, [name]);

  const openProfile = useCallback(async (id: string) => {
    setStatus("loading-profile");
    const res = await fetch(`/api/people/${id}`);
    setProfile(await res.json());
    setStatus("idle");
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <Wordmark />
        <div className="flex gap-4 text-xs">
          <a href="/person/merges" className="text-chrome-500 hover:text-chrome-100">Review merges</a>
          <a href="/" className="text-chrome-500 hover:text-chrome-100">Workspace →</a>
        </div>
      </div>

      <h1 className="mb-1 text-2xl text-chrome-50">Who is…</h1>
      <p className="mb-4 text-sm text-chrome-500">
        Search reputable public NZ registers to assemble a provenance-backed picture of a person.
      </p>

      <div className="flex gap-2">
        <div className="flex flex-1 items-center gap-2 rounded border border-chrome-700 bg-navy-800 px-3 py-2">
          <Search size={16} className="text-chrome-500" />
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") search(); }}
            placeholder="e.g. Jane Smith"
            className="w-full bg-transparent text-base outline-none placeholder-chrome-500"
          />
        </div>
        <button onClick={search} disabled={status !== "idle"}
          className="rounded border border-chrome-700 bg-navy-700 px-4 text-sm hover:border-cyan-signal disabled:opacity-50">
          Search
        </button>
        <button onClick={sweep} disabled={status !== "idle"}
          className="flex items-center gap-1.5 rounded bg-cyan-signal/15 px-4 text-sm text-cyan-signal hover:bg-cyan-signal/25 disabled:opacity-50">
          {status === "sweeping" ? <Loader2 size={14} className="animate-spin" /> : <Radar size={14} />}
          Sweep sources
        </button>
      </div>

      <p className="mt-2 text-[11px] text-chrome-600">
        <strong>Search</strong> looks in already-ingested data. <strong>Sweep</strong> runs live
        connectors (Companies Register, Charities, licence registers) for this name — slower, polite (~1 req/sec).
      </p>

      {sweepReport && (
        <div className="mt-4 rounded border border-chrome-700 bg-navy-800 p-3 text-xs">
          <div className="mb-1 text-chrome-500">Sweep results:</div>
          <div className="flex flex-wrap gap-2">
            {sweepReport.map((s: any) => (
              <span key={s.source} className={s.ok ? "text-cyan-signal" : "text-chrome-600"}>
                {s.source}: {s.ok ? `${s.objects ?? 0} records` : "unavailable"}
              </span>
            ))}
          </div>
        </div>
      )}

      {status === "searching" && <div className="mt-6 text-sm text-chrome-500">Searching…</div>}

      {!profile && results.length > 0 && (
        <ul className="mt-6 space-y-1">
          {results.map(p => (
            <li key={p.id}>
              <button onClick={() => openProfile(p.id)}
                className="flex w-full items-center justify-between rounded border border-chrome-700 bg-navy-800 px-3 py-2 text-left hover:border-cyan-signal">
                <span className="text-chrome-100">{String(p.properties.fullName)}</span>
                <span className="text-xs text-chrome-500">
                  {[p.properties.residentialLocality, p.properties.occupation].filter(Boolean).join(" · ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {status === "loading-profile" && <div className="mt-6 text-sm text-chrome-500">Assembling profile…</div>}
      {profile && (
        <div className="mt-6">
          <button onClick={() => setProfile(null)} className="mb-3 text-xs text-chrome-500 hover:text-chrome-100">← back to results</button>
          <PersonProfile profile={profile} />
        </div>
      )}
    </div>
  );
}

export default function PersonPage() {
  return <Suspense><PersonSearch /></Suspense>;
}
