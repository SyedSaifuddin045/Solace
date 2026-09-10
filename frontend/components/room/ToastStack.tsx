"use client";
import { useEffect, useState } from "react";

export interface Toast { id: number; text: string; tone: "ok" | "amber" | "err" }
let push: ((t: Omit<Toast, "id">) => void) | null = null;
let seq = 0;

export function pushToast(text: string, tone: Toast["tone"] = "amber") {
  push?.({ text, tone });
}

const TONE_COLOR: Record<Toast["tone"], string> = {
  ok: "var(--status-success)",
  amber: "var(--accent-amber)",
  err: "var(--status-error)",
};

export function ToastStack() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    push = (t) => {
      const id = ++seq;
      setToasts((cur) => [...cur.slice(-2), { ...t, id }]); // max 3 visible
      setTimeout(() => setToasts((cur) => cur.filter((x) => x.id !== id)), 4000);
    };
    return () => { push = null; };
  }, []);

  return (
    <div className="flex flex-col items-end gap-1.5 mb-2">
      {toasts.map((t) => (
        <div key={t.id} className="glass rounded-lg px-3 py-1.5 text-[10px] flex items-center gap-2" style={{ background: "rgba(26,22,20,0.72)" }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: TONE_COLOR[t.tone] }} />
          <span className="opacity-80">{t.text}</span>
        </div>
      ))}
    </div>
  );
}