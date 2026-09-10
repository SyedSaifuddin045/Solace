import { describe, it, expect } from "vitest";
import { formatRemaining, progressPct } from "@/lib/time";

describe("formatRemaining", () => {
  it("formats mm:ss", () => {
    expect(formatRemaining(60_000)).toBe("01:00");
    expect(formatRemaining(90_500)).toBe("01:31"); // 90.5s → ceil seconds
    expect(formatRemaining(1_500_000)).toBe("25:00");
  });
  it("null → --:--", () => expect(formatRemaining(null)).toBe("--:--"));
  it("negative → 00:00", () => expect(formatRemaining(-5)).toBe("00:00"));
});

describe("progressPct", () => {
  it("computes percent between remaining and duration", () => {
    // duration 25min, 10min remaining → 40% left
    expect(progressPct({ status: "running", durationMs: 1_500_000, remainingMs: 600_000, endsAt: 0, startedBy: null, startedAt: null, updatedAt: 0 })).toBeCloseTo(40, 5);
  });
  it("idle → 0", () => {
    expect(progressPct({ status: "idle", durationMs: 0, remainingMs: 0, endsAt: null, startedBy: null, startedAt: null, updatedAt: 0 })).toBe(0);
  });
});