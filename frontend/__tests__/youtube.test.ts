import { describe, expect, it } from "vitest";
import { extractYouTubeId, makeEmbedUrl } from "@/lib/youtube";

describe("extractYouTubeId", () => {
  it("extracts id from watch URLs", () => {
    expect(extractYouTubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("extracts id from youtu.be short links", () => {
    expect(extractYouTubeId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("extracts id from shorts", () => {
    expect(extractYouTubeId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("extracts id from embed URLs", () => {
    expect(extractYouTubeId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("extracts id from music URLs", () => {
    expect(extractYouTubeId("https://music.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("returns null for non-youtube URLs", () => {
    expect(extractYouTubeId("https://soundcloud.com/artist/track")).toBeNull();
    expect(extractYouTubeId("not a url")).toBeNull();
  });
});

describe("makeEmbedUrl", () => {
  it("builds nocookie embed URL with jsapi", () => {
    expect(makeEmbedUrl("dQw4w9WgXcQ")).toContain("youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(makeEmbedUrl("dQw4w9WgXcQ")).toContain("enablejsapi=1");
  });
});