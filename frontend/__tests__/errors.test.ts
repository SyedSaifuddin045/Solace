import { describe, it, expect } from "vitest";
import { userMessage, httpUploadError } from "@/lib/errors";

describe("userMessage", () => {
  it("maps known codes to human strings", () => {
    expect(userMessage("ROOM_NOT_FOUND", "")).toContain("not found");
    expect(userMessage("ROOM_FULL", "room is full")).toBe("room is full");
    expect(userMessage("NOT_HOST", "")).toContain("host");
    expect(userMessage("ALREADY_IN_ROOM", "")).not.toBe("");
  });
  it("falls back to raw message or generic", () => {
    expect(userMessage("WEIRD", "server said x")).toBe("server said x");
    expect(userMessage("WEIRD", "")).toBe("Something went wrong.");
  });
});

describe("httpUploadError", () => {
  it("maps statuses", () => {
    expect(httpUploadError(413)).toContain("20 MB");
    expect(httpUploadError(415)).toContain("format");
    expect(httpUploadError(404).toLowerCase()).toContain("room");
    expect(httpUploadError(500)).toBe("Upload failed.");
  });
});
