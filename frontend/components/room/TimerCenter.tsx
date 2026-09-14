"use client";
import { useEffect, useState } from "react";
import { Play, Pause, RotateCcw, Minimize2, Clock, X } from "lucide-react";
import { useRoomStore } from "@/lib/store";
import { getSocket } from "@/lib/socket";
import { loadPrefs, savePrefs } from "@/lib/prefs";
import { useTimerCountdown } from "@/hooks/useTimerCountdown";
import { formatRemaining } from "@/lib/time";
import { useIdle } from "@/hooks/useIdle";
import { ClockDial } from "@/components/timer/ClockDial";

export function TimerCenter() {
  const [mounted, setMounted] = useState(false);
  const timer = useRoomStore((s) => s.state.timer);
  const pending = useRoomStore((s) => s.pendingTimerMinutes);
  const [dialOpen, setDialOpen] = useState(false);
  const [dialValue, setDialValue] = useState(pending ?? loadPrefs().lastTimerMinutes);
  const [minimized, setMinimized] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const idle = useIdle();
  const { remainingMs, running } = useTimerCountdown(timer);

  useEffect(() => { setMounted(true); }, []);

  const startTimer = (mins: number) => {
    getSocket().emit("timer:start", { minutes: mins });
    useRoomStore.getState().armTimer(null);
    const p = loadPrefs();
    p.lastTimerMinutes = mins;
    savePrefs(p);
    setDialOpen(false);
    setExpanded(true);
  };

  const pause = () => getSocket().emit("timer:pause");
  const resume = () => getSocket().emit("timer:resume");
  const reset = () => { getSocket().emit("timer:reset"); setExpanded(false); };
  const minimize = () => setMinimized(true);

  // IDLE STATE: hide icon on inactivity (unless dial is open)
  useEffect(() => {
    if (timer.status !== "idle" || !mounted) return;
    if (idle && !dialOpen) setDialOpen(false); // just ensure clean state
  }, [idle, mounted, timer.status, dialOpen]);

  // RUNNING STATE: minimize on inactivity, expand on click only
  useEffect(() => {
    if (timer.status === "idle" || !mounted) return;
    if (idle && expanded) setMinimized(true);
  }, [idle, mounted, timer.status, expanded]);

  // Auto-expand when timer completes while minimized
  useEffect(() => {
    if (minimized && timer.status === "idle" && timer.remainingMs === 0 && timer.durationMs > 0) {
      setMinimized(false);
      setExpanded(false);
    }
  }, [minimized, timer.status, timer.remainingMs, timer.durationMs]);

  if (!mounted) return null;

  // ── IDLE: clock icon that hides on inactivity ──
  if (timer.status === "idle") {
    return (
      <>
        {/* clock icon — hidden when idle and no activity */}
        <button
          onClick={() => { setDialOpen(true); setDialValue(pending ?? loadPrefs().lastTimerMinutes); }}
          className={`absolute top-4 left-1/2 -translate-x-1/2 z-20 pointer-events-auto transition-opacity duration-300 hairline rounded-full p-2 ${idle && !dialOpen ? "opacity-0 pointer-events-none" : "opacity-70 hover:opacity-100"}`}
          aria-label="set timer"
        >
          <Clock size={12} style={{ color: "var(--accent-amber)" }} />
        </button>

        {/* ClockDial modal — stays open regardless of inactivity */}
        {dialOpen && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 pointer-events-auto">
            <div className="glass rounded-xl p-4 flex flex-col items-center gap-3" style={{ background: "rgba(26,22,20,0.92)" }}>
              {/* close button — top right */}
              <button
                onClick={() => setDialOpen(false)}
                className="absolute top-2 right-2 opacity-50 hover:opacity-100 transition-opacity"
                aria-label="close"
              >
                <X size={12} />
              </button>

              <div className="w-[180px] mt-1" style={{ aspectRatio: "11/12" }}>
                <ClockDial value={dialValue} onChange={setDialValue} />
              </div>

              <button
                onClick={() => startTimer(dialValue)}
                className="rounded-full px-6 py-1.5 text-[11px] font-medium"
                style={{ background: "var(--accent-amber)", color: "#14110F" }}
              >
                set
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  // ── RUNNING / PAUSED ──

  // Minimized: amber pulse hint — click to expand
  if (minimized) {
    return (
      <button
        onClick={() => { setMinimized(false); setExpanded(true); }}
        className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 opacity-80 hover:opacity-100 pointer-events-auto"
        style={{ color: "var(--accent-amber)" }}
        aria-label="show timer"
      >
        <span className="w-2 h-2 rounded-full pulse-amber" style={{ background: "var(--accent-amber)" }} />
        <span className="text-[10px] tracking-wide">{formatRemaining(remainingMs)}</span>
      </button>
    );
  }

  // Expanded card
  return (
    <div className="absolute top-2 sm:top-4 left-1/2 -translate-x-1/2 z-20 glass rounded-xl px-5 py-2.5 text-center warm-glow chrome max-w-[90vw] pointer-events-auto">
      <p className="text-[10px] opacity-50 mb-0.5">pomodoro · {timer.status}</p>
      <p className="text-xl font-light tracking-wide leading-none" style={{ color: "var(--accent-amber)" }}>
        {formatRemaining(running || timer.status === "paused" ? remainingMs : timer.durationMs)}
      </p>
      <div className="h-[3px] rounded mt-1.5 mb-2" style={{ background: "rgba(237,224,210,0.15)" }}>
        <div className="h-full rounded transition-all duration-300" style={{ width: `${timer.durationMs > 0 ? Math.min(100, Math.max(0, (remainingMs / timer.durationMs) * 100)) : 0}%`, background: "var(--accent-amber)" }} />
      </div>
      <div className="flex items-center gap-1.5 justify-center">
        {timer.status === "running" && (
          <button onClick={pause} aria-label="Pause" className="hairline rounded-full p-1.5 text-[10px]"><Pause size={10} /></button>
        )}
        {timer.status === "paused" && (
          <button onClick={resume} aria-label="Resume" className="hairline rounded-full p-1.5 text-[10px]"><Play size={10} /></button>
        )}
        <button onClick={reset} aria-label="Reset" className="hairline rounded-full p-1.5 text-[10px]"><RotateCcw size={10} /></button>
        <button onClick={minimize} aria-label="Minimize" className="hairline rounded-full p-1.5 text-[10px]"><Minimize2 size={10} /></button>
      </div>
    </div>
  );
}
