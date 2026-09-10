import { describe, it, expect, beforeEach } from "vitest";
import { ACCENTS, applyTheme, type ThemePrefs } from "@/lib/theme";

describe("applyTheme", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("style");
  });
  it("writes accent + knobs + font onto documentElement style", () => {
    const t: ThemePrefs = { accent: "rose", glow: 40, dim: 70, blur: 18, font: "serif" };
    applyTheme(t);
    const el = document.documentElement;
    expect(el.style.getPropertyValue("--accent-amber")).toBe(ACCENTS.rose.amber);
    expect(el.style.getPropertyValue("--accent-violet")).toBe(ACCENTS.rose.violet);
    expect(el.style.getPropertyValue("--accent-rose")).toBe(ACCENTS.rose.rose);
    expect(el.style.getPropertyValue("--glow")).toBe("40%");
    expect(el.style.getPropertyValue("--dim")).toBe("70%");
    expect(el.style.getPropertyValue("--blur")).toBe("18px");
    expect(el.style.getPropertyValue("--font-display")).toContain("serif");
  });
  it("clamps ranges", () => {
    applyTheme({ accent: "amber", glow: 999, dim: -5, blur: 0, font: "sans" });
    expect(document.documentElement.style.getPropertyValue("--glow")).toBe("100%");
    expect(document.documentElement.style.getPropertyValue("--dim")).toBe("0%");
    expect(document.documentElement.style.getPropertyValue("--blur")).toBe("8px");
  });
});