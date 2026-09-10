import type { TimerState } from "@/lib/store";

export function formatRemaining(ms: number | null): string {
  if (ms === null) return "--:--";
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function progressPct(t: TimerState): number {
  if (t.status === "idle" || t.durationMs === 0) return 0;
  return Math.min(100, Math.max(0, (t.remainingMs / t.durationMs) * 100));
}