import { describe, it, expect, vi, afterEach } from "vitest";
import { uploadWallpaper } from "@/lib/upload";

describe("uploadWallpaper", () => {
  afterEach(() => vi.restoreAllMocks());

  it("uploads and returns { url, kind }", async () => {
    const ok = new Response(JSON.stringify({ id: "u1", url: "/uploads/r/a.png", kind: "image", size: 10 }), { status: 201, headers: { "Content-Type": "application/json" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok));
    const file = new File(["x"], "a.png", { type: "image/png" });
    const res = await uploadWallpaper("R1", file);
    expect(res.url).toContain("a.png");
    expect(res.kind).toBe("image");
    const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(call[0].endsWith("/uploads")).toBe(true);
  });

  it("throws mapped message on 413", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("too big", { status: 413 })));
    await expect(uploadWallpaper("R1", new File(["x"], "b.mp4", { type: "video/mp4" }))).rejects.toThrow("20 MB");
  });
});
