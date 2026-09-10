"use client";
import { useState } from "react";
import { Play, Pause, RotateCcw, Minimize2 } from "lucide-react";
import { useRoomStore } from "@/lib/store";
import { getSocket } from "@/lib/socket";
import { useTimerCountdown } from "@/hooks/useTimerCountdown";
import { formatRemaining, progressPct } from "@/lib/time";
import { useIdle } from "@/hooks/useIdle";

export function TimerCenter() {
  const timer = useRoomStore((s) => s.state.timer);
  const [minimized, setMinimized] = useState(false);
  const idle = useIdle();
  const { remainingMs, running } = useTimerCountdown(timer);

  const start25 = () => getSocket().emit("timer:start", { minutes: 25 });
  const pause = () => getSocket().emit("timer:pause");
  const reset = () => getSocket().emit("timer:reset");

  const hintVisible = running && (idle || minimized);

  return (
    <>
      {/* minimized + running: amber pulse hint */}
      {hintVisible && (
        <button
          onClick={() => setMinimized(false)}
          className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 opacity-80 hover:opacity-100"
          style={{ color: "var(--accent-amber)" }}
          aria-label="show timer"
        >
          <span className="w-2 h-2 rounded-full pulse-amber" style={{ background: "var(--accent-amber)" }} />
          <span className="text-[10px] tracking-wide">{formatRemaining(remainingMs)}</span>
        </button>
      )}

      {/* expanded card — chrome family (hides on idle) */}
      {!idle && !minimized && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 glass rounded-xl px-5 py-2.5 text-center warm-glow chrome">
          <p className="text-[10px] opacity-50 mb-0.5">pomodoro · {timer.status}</p>
          <p className="text-xl font-light tracking-wide leading-none" style={{ color: "var(--accent-amber)" }}>{formatRemaining(running || timer.status === "paused" ? remainingMs : timer.durationMs)}</p>
          <div className="h-[3px] rounded mt-1.5 mb-2" style={{ background: "rgba(237,224,210,0.15)" }}>
            <div className="h-full rounded" style={{ width: `${progressPct(timer)}%`, background: "var(--accent-amber)" }} />
          </div>
          <div className="flex items-center gap-1.5 justify-center">
            <button onClick={start25} aria-label="Start 25" disabled={timer.status === "running"} className="rounded-full px-3 py-1 text-[10px] flex items-center gap-1 disabled:opacity-40" style={{ background: "rgba(224,164,88,0.16)", color: "var(--accent-amber)" }}>
              <Play size={10} /> start 25
            </button>
            {timer.status === "running" && (
              <button onClick={pause} aria-label="Pause" className="hairline rounded-full p-1.5 text-[10px]"><Pause size={10} /></button>
            )}
            <button onClick={reset} aria-label="Reset" className="hairline rounded-full p-1.5 text-[10px]"><RotateCcw size={10} /></button>
            <button onClick={() => setMinimized(true)} aria-label="Minimize" className="hairline rounded-full p-1.5 text-[10px]"><Minimize2 size={10} /></button>
          </div>
        </div>
      )}
    </>
  );
}