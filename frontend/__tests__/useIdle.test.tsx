import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useIdle } from "@/hooks/useIdle";

describe("useIdle", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("starts visible, hides after timeout, shows on mousemove", () => {
    const { result } = renderHook(() => useIdle(5_000));
    expect(result.current).toBe(false);
    act(() => vi.advanceTimersByTime(5_001));
    expect(result.current).toBe(true);
    act(() => window.dispatchEvent(new Event("mousemove")));
    expect(result.current).toBe(false);
  });
});