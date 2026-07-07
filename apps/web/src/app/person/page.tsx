"use client";

import { useState, useCallback, Suspense } from "react";
import { Loader2, Radar, Bell, Plus } from "lucide-react";
import { Wordmark } from "@/components/Wordmark";
import { PersonProfile } from "@/components/PersonProfile";

type PersonRow = { id: string; properties: Record<string, any>; provenance: any; fitScore?: number };

function PersonSearch() {
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [locality, setLocality] = useState("");
  const [occupation, setOccupation] = useState("");
  const [results, setResults] = useState<PersonRow[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [status, setStatus] = useState<"idle" | "sweeping" | "loading-profile">("idle");
  const [report, setReport] = useState<any[] | null>(null);
  const [watched, setWatched] = useState(false);

  const facts = () => ({
    dateOfBirth: dob || undefined,
    locality: locality || undefined,
    occupation: occupation || undefined,
  });

  const find = useCallback(async () => {
    if (name.trim().length < 2) return;
    setStatus("sweeping"); setProfile(null); setWatched(false);
    const res = await fetch("/api/people/sweep", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, facts: facts() }),
    });
    const data = await res.json();
    setResults(data.people ?? []);
    setReport(data.sourceResults ?? null);
    setStatus("idle");
  }, [name, dob, locality, occupation]);

  const openProfile = useCallback(async (id: string) => {
    setStatus("loading-profile");
    const res = await fetch(`/api/people/${id}`);
    setProfile(await res.json());
    setStatus("idle");
  }, []);

  const watch = useCallback(async () => {
    await fetch("/api/watchlist", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, facts: facts() }),
    });
    setWatched(true);
  }, [name, dob, locality, occupation]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <Wordmark />
        <div className="flex gap-4 text-xs">
          <a href="/person/watchlist" className="flex items-center gap-1 text-chrome-500 hover:text-chrome-100"><Bell size={12} /> Watchlist</a>
          <a href="/person/merges" className="text-chrome-500 hover:text-chrome-100">Review merges</a>
          <a href="/" className="text-chrome-500 hover:text-chrome-100">Workspace →</a>
        </div>
      </div>

      <h1 className="mb-1 text-2xl text-chrome-50">Who is…</h1>
      <p className="mb-4 text-sm text-chrome-500">
        Enter a name and anything you already know. Scopium searches reputable public NZ
        registers live and assembles a provenance-backed profile — nothing to pre-load.
      </p>

      <div className="space-y-2">
        <input
          value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") find(); }}
          placeholder="Full name — e.g. Jane Smith"
          className="w-full rounded border border-chrome-700 bg-navy-800 px-3 py-2.5 text-base outline-none placeholder-chrome-500 focus:border-cyan-signal"
        />
        <div className="grid grid-cols-3 gap-2">
          <input value={dob} onChange={e => setDob(e.target.value)} placeholder="Born (YYYY or YYYY-MM-DD)"
            className="rounded border border-chrome-700 bg-navy-800 px-3 py-2 text-sm outline-none placeholder-chrome-600 focus:border-cyan-signal" />
          <input value={locality} onChange={e => setLocality(e.target.value)} placeholder="Locality (e.g. Wellington)"
            className="rounded border border-chrome-700 bg-navy-800 px-3 py-2 text-sm outline-none placeholder-chrome-600 focus:border-cyan-signal" />
          <input value={occupation} onChange={e => setOccupation(e.target.value)} placeholder="Occupation"
            className="rounded border border-chrome-700 bg-navy-800 px-3 py-2 text-sm outline-none placeholder-chrome-600 focus:border-cyan-signal" />
        </div>
        <div className="flex gap-2">
          <button onClick={find} disabled={status !== "idle" || name.trim().length < 2}
            className="flex items-center gap-1.5 rounded bg-cyan-signal/15 px-4 py-2 text-sm text-cyan-signal hover:bg-cyan-signal/25 disabled:opacity-50">
            {status === "sweeping" ? <Loader2 size={14} className="animate-spin" /> : <Radar size={14} />}
            {status === "sweeping" ? "Searching sources…" : "Find this person"}
          </button>
          <button onClick={watch} disabled={name.trim().length < 2 || watched}
            className="flex items-center gap-1.5 rounded border border-chrome-700 px-4 py-2 text-sm text-chrome-300 hover:border-amber-alert hover:text-amber-alert disabled:opacity-50">
            {watched ? <><Bell size={14} /> Watching</> : <><Plus size={14} /> Watch & notify</>}
          </button>
        </div>
      </div>

      {report && (
        <div className="mt-4 rounded border border-chrome-700 bg-navy-800 p-3 text-xs">
          <div className="mb-1 text-chrome-500">Searched {report.length} sources:</div>
          <div className="flex flex-wrap gap-2">
            {report.map((s: any) => (
              <span key={s.source} className={s.ok && s.objects ? "text-cyan-signal" : "text-chrome-600"}>
                {s.source}{s.ok ? ` (${s.objects ?? 0})` : " ✕"}
              </span>
            ))}
          </div>
        </div>
      )}

      {status === "sweeping" && <div className="mt-6 text-sm text-chrome-500">Sweeping public registers (polite, ~1 req/sec)…</div>}

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

      {!profile && results.length === 0 && report && status === "idle" && (
        <div className="mt-6 rounded-lg border border-chrome-700 bg-navy-800 p-6 text-sm text-chrome-500">
          No matching people found in the searched registers. Try fewer known facts, or
          <button onClick={watch} className="ml-1 text-amber-alert hover:underline">watch this name</button> to be
          notified if they surface later.
        </div>
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
