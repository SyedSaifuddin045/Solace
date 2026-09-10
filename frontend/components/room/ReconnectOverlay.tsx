"use client";
import { RefreshCw } from "lucide-react";

export function ReconnectOverlay({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="absolute inset-0 z-40 grid place-items-center" style={{ background: "rgba(26,22,20,0.55)" }}>
      <div className="glass rounded-xl px-6 py-4 text-center warm-glow">
        <p className="text-[12px]" style={{ color: "var(--status-warning)" }}>signal lost</p>
        <p className="text-[10px] opacity-60 mt-1">reconnecting…</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-3 hairline rounded-full px-4 py-1.5 text-[10px] flex items-center gap-1.5 mx-auto"
        >
          <RefreshCw size={10} /> retry
        </button>
      </div>
    </div>
  );
}