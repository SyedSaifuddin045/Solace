import { useEffect, useState } from "react";
import type { TimerState } from "@/lib/store";

export function useTimerCountdown(t: TimerState, intervalMs = 250): { remainingMs: number; running: boolean } {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (t.status !== "running" || !t.endsAt) return;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [t.status, t.endsAt, intervalMs]);

  if (t.status === "running" && t.endsAt) {
    return { remainingMs: Math.max(0, t.endsAt - now), running: true };
  }
  return { remainingMs: t.status === "paused" ? t.remainingMs : 0, running: false };
}