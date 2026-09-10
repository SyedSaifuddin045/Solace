import { describe, it, expect, beforeEach } from "vitest";
import { DEFAULT_PREFS, loadPrefs, savePrefs, type Prefs } from "@/lib/prefs";

const KEY = "solace.prefs";

describe("prefs", () => {
  beforeEach(() => localStorage.clear());

  it("returns defaults when nothing stored", () => {
    const p = loadPrefs();
    expect(p).toEqual(DEFAULT_PREFS);
  });
  it("round-trips save → load", () => {
    const p: Prefs = { ...DEFAULT_PREFS, name: "Saif", avatar: "data:image/png;base64,abc", theme: { accent: "violet", glow: 60, dim: 60, blur: 12, font: "mono" }, recentRooms: ["ABC123"] };
    savePrefs(p);
    expect(loadPrefs()).toEqual(p);
  });
  it("falls back to defaults for corrupt JSON", () => {
    localStorage.setItem(KEY, "{not json");
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
  });
});