"use client";

/**
 * Investigation state is URL-shareable. We encode the workspace state
 * (selected ids, active view, last query AST) into the search string so a
 * permalink reproduces the analyst's exact view.
 */
import { useEffect, useState, useCallback } from "react";
import type { QueryAst } from "@scopium/query";

export type WorkspaceState = {
  view: "graph" | "map" | "timeline" | "table";
  selection: string[];
  ast?: QueryAst;
  question?: string;
};

const DEFAULT: WorkspaceState = { view: "graph", selection: [] };

const encode = (s: WorkspaceState): string => {
  const json = JSON.stringify(s);
  return typeof window === "undefined" ? "" : btoa(unescape(encodeURIComponent(json)));
};

const decode = (s: string | null): WorkspaceState => {
  if (!s) return DEFAULT;
  try {
    return JSON.parse(decodeURIComponent(escape(atob(s))));
  } catch {
    return DEFAULT;
  }
};

export const useWorkspaceState = (): [WorkspaceState, (next: Partial<WorkspaceState>) => void] => {
  const [state, setState] = useState<WorkspaceState>(DEFAULT);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setState(decode(params.get("s")));
  }, []);

  const update = useCallback((patch: Partial<WorkspaceState>) => {
    setState(prev => {
      const next = { ...prev, ...patch };
      const url = new URL(window.location.href);
      url.searchParams.set("s", encode(next));
      window.history.replaceState({}, "", url.toString());
      return next;
    });
  }, []);

  return [state, update];
};
