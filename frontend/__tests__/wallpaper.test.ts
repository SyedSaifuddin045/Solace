import { describe, it, expect } from "vitest";
import { isGradientUrl, gradientCss } from "@/lib/wallpaper";

describe("isGradientUrl", () => {
  it("returns true for gradient:embers", () => {
    expect(isGradientUrl("gradient:embers")).toBe(true);
  });
  it("returns true for any gradient: prefix", () => {
    expect(isGradientUrl("gradient:unknown")).toBe(true);
  });
  it("returns false for null", () => {
    expect(isGradientUrl(null)).toBe(false);
  });
  it("returns false for undefined", () => {
    expect(isGradientUrl(undefined)).toBe(false);
  });
  it("returns false for empty string", () => {
    expect(isGradientUrl("")).toBe(false);
  });
  it("returns false for normal url", () => {
    expect(isGradientUrl("https://example.com/img.png")).toBe(false);
  });
});

describe("gradientCss", () => {
  it("returns css string for valid id", () => {
    const result = gradientCss("gradient:embers");
    expect(result).toContain("linear-gradient");
    expect(result).toContain("#3b1d1a");
  });
  it("returns null for unknown id", () => {
    expect(gradientCss("gradient:nonexistent")).toBeNull();
  });
  it("returns null for non-gradient url", () => {
    expect(gradientCss("https://example.com/img.png")).toBeNull();
  });
  it("returns null for null", () => {
    expect(gradientCss(null)).toBeNull();
  });
  it("returns null for undefined", () => {
    expect(gradientCss(undefined)).toBeNull();
  });
});