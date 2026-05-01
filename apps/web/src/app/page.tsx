"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { Search, Network, Map as MapIcon, Calendar, Table2, Sparkles } from "lucide-react";
import { Wordmark } from "@/components/Wordmark";
import { AskPalette, type AskResult } from "@/components/AskPalette";
import { TableView } from "@/components/TableView";
import { DetailPanel } from "@/components/DetailPanel";
import { useWorkspaceState } from "@/lib/url-state";
import { cn } from "@/lib/cn";

const GraphView = dynamic(() => import("@/components/GraphView").then(m => m.GraphView), { ssr: false });
const MapView = dynamic(() => import("@/components/MapView").then(m => m.MapView), { ssr: false });
const TimelineView = dynamic(() => import("@/components/TimelineView").then(m => m.TimelineView), { ssr: false });

type Row = { id: string; type: string; properties: Record<string, unknown>; classification: string; provenance: any };
type Link = { id: string; type: string; from_id: string; to_id: string; properties: Record<string, unknown> };

export default function Workspace() {
  const [state, setState] = useWorkspaceState();
  const [askOpen, setAskOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeId, setActiveId] = useState<string | undefined>();

  // Cmd-K opens the Ask palette
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAskOpen(o => !o);
      }
      if (e.key === "Escape") setAskOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleAskResult = useCallback((r: AskResult) => {
    setRows(r.rows as Row[]);
    setLinks(r.links as Link[]);
    setState({
      ast: r.ast,
      question: undefined,
      selection: r.ids.slice(0, 5),
    });
    if (r.ids[0]) setActiveId(r.ids[0]);
    setAskOpen(false);
  }, [setState]);

  const search = useCallback(async () => {
    if (!searchTerm.trim()) return;
    const ast = {
      from: "NZCompany",
      where: [{ kind: "property", field: "name", op: "contains", value: searchTerm }],
      traverse: [],
      limit: 100,
    };
    const res = await fetch("/api/query", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ast),
    });
    const data = await res.json();
    setRows(data.rows);
    setLinks(data.links);
    setState({ selection: data.ids.slice(0, 5) });
  }, [searchTerm, setState]);

  const graphData = useMemo(() => {
    const nodes = rows.map(r => ({
      id: r.id, type: r.type,
      label: String(r.properties.name ?? r.properties.fullName ?? r.properties.title ?? r.id.slice(-6)),
    }));
    const ids = new Set(nodes.map(n => n.id));
    const edges = links
      .filter(l => ids.has(l.from_id) && ids.has(l.to_id))
      .map(l => ({ id: l.id, source: l.from_id, target: l.to_id, type: l.type }));
    return { nodes, edges };
  }, [rows, links]);

  const mapFeatures = useMemo(() =>
    rows.flatMap(r => {
      const p = r.properties.point as { lat?: number; lon?: number } | undefined;
      if (!p?.lat || !p?.lon) return [];
      return [{
        id: r.id, type: r.type, lat: p.lat, lon: p.lon,
        label: String(r.properties.name ?? r.id),
      }];
    }), [rows]);

  const timelinePoints = useMemo(() =>
    rows.flatMap(r => {
      const dates = ["incorporationDate", "occurredAt", "publishedAt"];
      for (const k of dates) {
        const v = r.properties[k];
        if (typeof v === "string") {
          const t = Date.parse(v);
          if (!Number.isNaN(t)) {
            return [{
              id: r.id, type: r.type, t,
              label: String(r.properties.name ?? r.properties.title ?? r.id),
            }];
          }
        }
      }
      return [];
    }), [rows]);

  const onSelect = useCallback((id: string) => {
    setActiveId(id);
    setState({ selection: [id] });
  }, [setState]);

  return (
    <div className="grid h-screen grid-cols-[260px_1fr_360px] grid-rows-[48px_1fr]">
      {/* Top bar */}
      <header className="col-span-3 flex items-center justify-between border-b border-chrome-700 bg-navy-800 px-4">
        <Wordmark />
        <button
          onClick={() => setAskOpen(true)}
          className="flex items-center gap-2 rounded border border-chrome-700 bg-navy-700 px-3 py-1.5 text-sm text-chrome-300 hover:border-cyan-signal"
        >
          <Sparkles size={14} className="text-cyan-signal" />
          Ask Scopium
          <kbd className="ml-2 rounded border border-chrome-700 px-1.5 text-xs">⌘K</kbd>
        </button>
        <span className="text-xs text-chrome-500">See the whole picture.</span>
      </header>

      {/* Left rail */}
      <aside className="row-start-2 border-r border-chrome-700 bg-navy-800 p-3">
        <div className="mb-3 flex items-center gap-2 rounded bg-navy-700 px-2 py-1.5">
          <Search size={14} className="text-chrome-500" />
          <input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") search(); }}
            placeholder="Search NZ companies"
            className="w-full bg-transparent text-sm outline-none placeholder-chrome-500"
          />
        </div>
        <div className="text-xs uppercase tracking-wider text-chrome-500">Recent investigations</div>
        <ul className="mt-2 space-y-1 text-sm text-chrome-300">
          <li className="rounded px-2 py-1 hover:bg-navy-700">Auckland fintechs 2024</li>
          <li className="rounded px-2 py-1 hover:bg-navy-700">Cross-directorships, banking</li>
        </ul>
        {state.ast && (
          <>
            <div className="mt-4 text-xs uppercase tracking-wider text-chrome-500">Last query AST</div>
            <pre className="mt-2 max-h-48 overflow-auto rounded bg-navy-700 p-2 text-[10px] text-chrome-300">
              {JSON.stringify(state.ast, null, 2)}
            </pre>
          </>
        )}
      </aside>

      {/* Centre */}
      <main className="row-start-2 flex flex-col">
        <nav className="flex border-b border-chrome-700 bg-navy-800 px-2">
          {(["graph", "table", "map", "timeline"] as const).map(view => (
            <button
              key={view}
              onClick={() => setState({ view })}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 text-sm",
                state.view === view ? "border-b-2 border-cyan-signal text-chrome-50" : "text-chrome-500 hover:text-chrome-100",
              )}
            >
              {view === "graph" && <Network size={14} />}
              {view === "table" && <Table2 size={14} />}
              {view === "map" && <MapIcon size={14} />}
              {view === "timeline" && <Calendar size={14} />}
              {view[0]!.toUpperCase() + view.slice(1)}
            </button>
          ))}
          <div className="ml-auto px-2 py-2 text-xs text-chrome-500">{rows.length} objects · {links.length} links</div>
        </nav>
        <div className="flex-1 overflow-hidden">
          {state.view === "graph" && (
            <GraphView
              nodes={graphData.nodes}
              edges={graphData.edges}
              selection={state.selection}
              onSelect={onSelect}
            />
          )}
          {state.view === "table" && (
            <TableView rows={rows} onSelect={onSelect} selection={state.selection} />
          )}
          {state.view === "map" && (
            <MapView features={mapFeatures} onSelect={onSelect} />
          )}
          {state.view === "timeline" && (
            <TimelineView points={timelinePoints} onSelect={onSelect} />
          )}
        </div>
      </main>

      {/* Right rail */}
      <aside className="row-start-2 border-l border-chrome-700 bg-navy-800">
        <DetailPanel id={activeId ?? state.selection[0]} onSelect={onSelect} />
      </aside>

      <AskPalette
        open={askOpen}
        onClose={() => setAskOpen(false)}
        onResult={handleAskResult}
      />
    </div>
  );
}
