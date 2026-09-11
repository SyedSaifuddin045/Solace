"use client";
import { useEffect, useState } from "react";
import { Play, Pause, RotateCcw, Minimize2, Clock } from "lucide-react";
import { useRoomStore } from "@/lib/store";
import { getSocket } from "@/lib/socket";
import { loadPrefs, savePrefs } from "@/lib/prefs";
import { useTimerCountdown } from "@/hooks/useTimerCountdown";
import { formatRemaining, progressPct } from "@/lib/time";
import { useIdle } from "@/hooks/useIdle";
import { ClockDial } from "@/components/timer/ClockDial";

export function TimerCenter() {
  const [mounted, setMounted] = useState(false);
  const timer = useRoomStore((s) => s.state.timer);
  const pending = useRoomStore((s) => s.pendingTimerMinutes);
  const [dialOpen, setDialOpen] = useState(false);
  const [dialValue, setDialValue] = useState(pending ?? loadPrefs().lastTimerMinutes);
  const [minimized, setMinimized] = useState(false);
  const idle = useIdle();
  const { remainingMs, running } = useTimerCountdown(timer);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    console.debug("[solace:FE] TimerCenter tick", {
      status: timer.status,
      remainingMs,
      durationMs: timer.durationMs,
      endsAt: timer.endsAt,
      running,
      idle,
      minimized,
    });
  });

  const startTimer = (mins: number) => {
    console.debug("[solace:FE] timer:start emit", { minutes: mins });
    getSocket().emit("timer:start", { minutes: mins });
    useRoomStore.getState().armTimer(null);
    const p = loadPrefs();
    p.lastTimerMinutes = mins;
    savePrefs(p);
    setDialOpen(false);
  };
  const resume = () => {
    console.debug("[solace:FE] timer:resume emit");
    getSocket().emit("timer:resume");
  };
  const pause = () => {
    console.debug("[solace:FE] timer:pause emit");
    getSocket().emit("timer:pause");
  };
  const reset = () => {
    console.debug("[solace:FE] timer:reset emit");
    getSocket().emit("timer:reset");
  };
  const minimize = () => {
    console.debug("[solace:FE] TimerCenter minimize", { running, idle, status: timer.status });
    setMinimized(true);
  };

  const hintVisible = mounted && minimized;

  useEffect(() => {
    if (hintVisible) {
      console.debug("[solace:FE] TimerCenter hint visible (minimized/idle transition)", { running, idle, minimized, status: timer.status });
    }
  }, [hintVisible, running, idle, minimized, timer.status]);

  // Auto-expand when timer pauses or completes while minimized
  useEffect(() => {
    if (minimized && timer.status !== "running") {
      setMinimized(false);
    }
  }, [minimized, timer.status]);

  if (!mounted) {
    return (
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 glass rounded-xl px-5 py-2.5 text-center warm-glow chrome" />
    );
  }

  return (
    <>
      {/* minimized: amber pulse hint (auto-expands on pause/idle) */}
      {hintVisible && (
        <button
          onClick={() => {
            console.debug("[solace:FE] TimerCenter expand", { running, idle, minimized });
            setMinimized(false);
          }}
          className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 opacity-80 hover:opacity-100"
          style={{ color: "var(--accent-amber)" }}
          aria-label="show timer"
        >
          <span className="w-2 h-2 rounded-full pulse-amber" style={{ background: "var(--accent-amber)" }} />
          <span className="text-[10px] tracking-wide">{formatRemaining(remainingMs)}</span>
        </button>
      )}

      {/* expanded card */}
      {!minimized && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 glass rounded-xl px-5 py-2.5 text-center warm-glow chrome">
          {timer.status !== "idle" && (
            <>
              <p className="text-[10px] opacity-50 mb-0.5">pomodoro · {timer.status}</p>
              <p className="text-xl font-light tracking-wide leading-none" style={{ color: "var(--accent-amber)" }}>{formatRemaining(running || timer.status === "paused" ? remainingMs : timer.durationMs)}</p>
              <div className="h-[3px] rounded mt-1.5 mb-2" style={{ background: "rgba(237,224,210,0.15)" }}>
                <div className="h-full rounded" style={{ width: `${progressPct(timer)}%`, background: "var(--accent-amber)" }} />
              </div>
            </>
          )}
          {timer.status === "idle" && (
            <div className="flex items-center gap-1.5 justify-center">
              {dialOpen ? (
                <div className="relative" style={{ width: 220, height: 240 }}>
                  <ClockDial
                    value={dialValue}
                    onChange={setDialValue}
                  />
                  <button
                    onClick={() => startTimer(dialValue)}
                    className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full px-4 py-1 text-[11px] font-medium"
                    style={{ background: "var(--accent-amber)", color: "#14110F" }}
                  >
                    set
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setDialValue(pending ?? loadPrefs().lastTimerMinutes);
                    setDialOpen(true);
                  }}
                  className="hairline rounded-full px-3 py-1 text-[10px] flex items-center gap-1"
                >
                  <Clock size={10} />
                  <span>set timer</span>
                </button>
              )}
            </div>
          )}
          {timer.status !== "idle" && (
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
          )}
        </div>
      )}
    </>
  );
}