"use client";

import { useEffect, useRef, useState } from "react";
import type { QueryAst } from "@scopium/query";
import { cn } from "@/lib/cn";

export type AskResult = {
  ast?: QueryAst;
  rows: any[];
  links: any[];
  ids: string[];
  answer: string;
};

export function AskPalette({
  open, onClose, onResult,
}: {
  open: boolean;
  onClose: () => void;
  onResult: (r: AskResult) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState<"idle" | "thinking" | "running" | "answering">("idle");
  const [thought, setThought] = useState("");
  const [answer, setAnswer] = useState("");

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  const submit = async () => {
    if (!question.trim()) return;
    setStatus("thinking"); setAnswer(""); setThought("");
    const acc: AskResult = { rows: [], links: [], ids: [], answer: "" };

    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });

    if (!res.body) return;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";
      for (const raw of events) {
        if (!raw.startsWith("data: ")) continue;
        const ev = JSON.parse(raw.slice(6));
        switch (ev.kind) {
          case "thinking": setThought(ev.text); setStatus("running"); break;
          case "plan": acc.ast = ev.ast; break;
          case "results": acc.rows = ev.rows; acc.ids = ev.ids; setStatus("answering"); break;
          case "links": acc.links = ev.links; break;
          case "delta": setAnswer(prev => prev + ev.text); acc.answer += ev.text; break;
          case "error": setThought(`Error: ${ev.message}`); setStatus("idle"); break;
          case "done": onResult(acc); setStatus("idle"); break;
        }
      }
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-[15vh]" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-lg border border-chrome-700 bg-navy-800 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="border-b border-chrome-700 px-4 py-2 text-xs text-chrome-300">
          Ask Scopium — Cmd-K
        </div>
        <input
          ref={inputRef}
          value={question}
          onChange={e => setQuestion(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") submit(); if (e.key === "Escape") onClose(); }}
          placeholder="e.g. How many companies were registered in Auckland in the last year?"
          className="w-full bg-transparent px-4 py-3 text-base text-chrome-50 placeholder-chrome-500 outline-none"
        />
        {(status !== "idle" || answer) && (
          <div className="border-t border-chrome-700 p-4">
            <div className={cn("mb-2 text-xs", status === "idle" ? "text-cyan-signal" : "animate-pulse text-cyan-signal")}>
              {status === "idle" ? "done" : status} {thought && `· ${thought}`}
            </div>
            <div className="prose prose-invert max-w-none whitespace-pre-wrap text-sm text-chrome-100">{answer}</div>
          </div>
        )}
      </div>
    </div>
  );
}
