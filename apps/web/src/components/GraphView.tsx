"use client";

import { useEffect, useRef } from "react";
import cytoscape, { type Core } from "cytoscape";

export type GraphNode = { id: string; type: string; label: string };
export type GraphEdge = { id: string; source: string; target: string; type: string };

export function GraphView({
  nodes, edges, selection, onSelect,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selection: string[];
  onSelect: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    cyRef.current = cytoscape({
      container: ref.current,
      elements: [
        ...nodes.map(n => ({ data: { id: n.id, label: n.label, type: n.type } })),
        ...edges.map(e => ({ data: { id: e.id, source: e.source, target: e.target, type: e.type } })),
      ],
      layout: { name: "cose", animate: false, padding: 24 } as any,
      style: [
        {
          selector: "node",
          style: {
            "background-color": "#13203A",
            "border-color": "#3DD9D6",
            "border-width": 1.5,
            label: "data(label)",
            color: "#E6EAF2",
            "font-size": 11,
            "text-outline-color": "#0B1220",
            "text-outline-width": 2,
            width: 28,
            height: 28,
          },
        },
        {
          selector: "node[type = 'NZCompany']",
          style: { "background-color": "#1B2C4F" },
        },
        {
          selector: "node[type = 'Person']",
          style: { "background-color": "#3A2540" },
        },
        {
          selector: "node:selected",
          style: { "border-color": "#F5A623", "border-width": 3 },
        },
        {
          selector: "edge",
          style: {
            "line-color": "#3DD9D6",
            "target-arrow-color": "#3DD9D6",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            width: 1,
            opacity: 0.7,
            label: "data(type)",
            color: "#9AA3B2",
            "font-size": 9,
            "text-rotation": "autorotate" as any,
          },
        },
      ],
    });

    cyRef.current.on("tap", "node", e => onSelect(e.target.id()));
    return () => { cyRef.current?.destroy(); cyRef.current = null; };
  }, [nodes, edges, onSelect]);

  useEffect(() => {
    if (!cyRef.current) return;
    cyRef.current.elements().unselect();
    selection.forEach(id => cyRef.current!.getElementById(id).select());
  }, [selection]);

  return <div ref={ref} className="cytoscape-host h-full w-full" />;
}
