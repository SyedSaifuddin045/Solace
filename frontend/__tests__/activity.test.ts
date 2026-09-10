import { describe, it, expect } from "vitest";
import { activityPresentation, type ActivityKind } from "@/lib/activity";

describe("activityPresentation", () => {
  it("returns string kind for every contract type", () => {
    for (const t of ["chat", "playback", "wallpaper", "title", "media", "timer", "system"]) {
      const kind = activityPresentation(t as ActivityKind).kind;
      expect(["chat", "playback", "wallpaper", "title", "media", "timer", "system"].includes(kind)).toBe(true);
    }
  });
  it("unknown types default to system", () => {
    expect(activityPresentation("bogus" as ActivityKind).kind).toBe("system");
  });
});
