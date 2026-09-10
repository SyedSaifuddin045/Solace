import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTimerCountdown } from "@/hooks/useTimerCountdown";
import type { TimerState } from "@/lib/store";

const RUNNING: TimerState = { status: "running", durationMs: 1_500_000, remainingMs: 600_000, endsAt: Date.now() + 600_000, startedBy: null, startedAt: null, updatedAt: 0 };

describe("useTimerCountdown", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("computes remaining from endsAt", () => {
    const { result } = renderHook(() => useTimerCountdown(RUNNING));
    // fake clock starts a few ms after module-scope Date.now(); allow drift
    expect(result.current.running).toBe(true);
    expect(result.current.remainingMs).toBeGreaterThan(599_800);
    expect(result.current.remainingMs).toBeLessThanOrEqual(600_000);
    act(() => vi.advanceTimersByTime(1_000));
    expect(result.current.remainingMs).toBeLessThan(600_000);
  });
  it("running false when idle", () => {
    const idle: TimerState = { ...RUNNING, status: "idle", endsAt: null, remainingMs: 0 };
    const { result } = renderHook(() => useTimerCountdown(idle));
    expect(result.current.running).toBe(false);
  });
});