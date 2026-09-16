import { beforeEach, describe, expect, it } from "vitest";
import { loadVolume, saveVolume } from "@/lib/volume";

describe("volume persistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defaults to 1 when nothing stored", () => {
    expect(loadVolume()).toBe(1);
  });

  it("round-trips a value", () => {
    saveVolume(0.35);
    expect(loadVolume()).toBe(0.35);
  });

  it("clamps above range on save", () => {
    saveVolume(1.7);
    expect(loadVolume()).toBe(1);
  });

  it("clamps below range on save", () => {
    saveVolume(-0.5);
    expect(loadVolume()).toBe(0);
  });

  it("falls back to 1 on corrupt storage", () => {
    window.localStorage.setItem("solace-volume", "loud");
    expect(loadVolume()).toBe(1);
  });
});