"use client";

import { ExternalLink, ShieldCheck, ShieldAlert } from "lucide-react";

type ObjectRow = { id: string; type: string; properties: Record<string, any>; provenance: any };
type Profile = {
  seedId: string;
  cluster: ObjectRow[];
  clusterConfidence: number;
  connected: Record<string, ObjectRow[]>;
  links: any[];
  sources: string[];
};

const SECTION_LABEL: Record<string, string> = {
  NZCompany: "Companies",
  Organisation: "Charities & organisations",
  Credential: "Professional licences",
  Event: "Events & notices",
  LINZParcel: "Property",
  Asset: "Assets",
};

const displayName = (o: ObjectRow) =>
  String(o.properties.name ?? o.properties.fullName ?? o.properties.title ?? o.properties.kind ?? o.id);

export function PersonProfile({ profile }: { profile: Profile }) {
  const primary = profile.cluster[0];
  const name = primary ? String(primary.properties.fullName ?? "Unknown") : "Unknown";
  const localities = Array.from(new Set(profile.cluster.map(c => c.properties.residentialLocality).filter(Boolean)));
  const dobYears = Array.from(new Set(profile.cluster.map(c => {
    const d = c.properties.dateOfBirth as string | undefined;
    return d ? d.slice(0, 4) : undefined;
  }).filter(Boolean)));

  return (
    <div className="space-y-5">
      <header className="rounded-lg border border-chrome-700 bg-navy-800 p-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl text-chrome-50">{name}</h1>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-chrome-400">
              {localities.length > 0 && <span>Locality: {localities.join(", ")}</span>}
              {dobYears.length > 0 && <span>Born: {dobYears.join(" / ")}</span>}
              <span>{profile.cluster.length} source record{profile.cluster.length === 1 ? "" : "s"}</span>
            </div>
          </div>
          <ConfidenceBadge value={profile.clusterConfidence} />
        </div>
        <div className="mt-3 flex flex-wrap gap-1">
          {profile.sources.map(s => (
            <span key={s} className="rounded bg-navy-700 px-2 py-0.5 text-[11px] text-cyan-signal">{s}</span>
          ))}
        </div>
      </header>

      {Object.entries(profile.connected).map(([type, rows]) => (
        <section key={type} className="rounded-lg border border-chrome-700 bg-navy-800 p-4">
          <h2 className="mb-2 text-xs uppercase tracking-wider text-chrome-500">
            {SECTION_LABEL[type] ?? type} ({rows.length})
          </h2>
          <ul className="space-y-1">
            {rows.map(o => (
              <li key={o.id} className="flex items-center justify-between rounded px-2 py-1.5 hover:bg-navy-700">
                <div>
                  <span className="text-chrome-100">{displayName(o)}</span>
                  <Attributes o={o} />
                </div>
                {o.provenance?.sourceUrl && (
                  <a href={o.provenance.sourceUrl} target="_blank" rel="noreferrer"
                     className="flex items-center gap-1 text-xs text-cyan-signal hover:underline">
                    source <ExternalLink size={12} />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {Object.keys(profile.connected).length === 0 && (
        <div className="rounded-lg border border-chrome-700 bg-navy-800 p-6 text-sm text-chrome-500">
          No connected records yet. Run a sweep to pull live data for this name.
        </div>
      )}
    </div>
  );
}

function Attributes({ o }: { o: ObjectRow }) {
  const bits: string[] = [];
  if (o.type === "NZCompany") { bits.push(String(o.properties.status ?? "")); if (o.properties.nzbn && o.properties.nzbn !== "0000000000000") bits.push(`NZBN ${o.properties.nzbn}`); }
  if (o.type === "Credential") { bits.push(String(o.properties.register ?? "")); bits.push(String(o.properties.status ?? "")); }
  if (o.type === "Event") bits.push(String(o.properties.occurredAt ?? "").slice(0, 10));
  const text = bits.filter(Boolean).join(" · ");
  return text ? <span className="ml-2 text-xs text-chrome-500">{text}</span> : null;
}

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const high = value >= 0.85;
  return (
    <span className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${
      high ? "bg-cyan-signal/10 text-cyan-signal" : "bg-amber-alert/10 text-amber-alert"
    }`}>
      {high ? <ShieldCheck size={13} /> : <ShieldAlert size={13} />}
      {pct}% match
    </span>
  );
}
