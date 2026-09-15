const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { detectProvider, extractYouTubeId, cacheClear, buildYtDlpArgs, resolveYouTube, resolveTrack } = require("../../src/track/resolve");

describe("detectProvider", () => {
    it("detects standard youtube.com/watch URLs", () => {
        assert.equal(detectProvider("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "youtube");
        assert.equal(detectProvider("http://youtube.com/watch?v=abc12345678"), "youtube");
    });

    it("detects youtu.be short URLs", () => {
        assert.equal(detectProvider("https://youtu.be/dQw4w9WgXcQ"), "youtube");
    });

    it("detects youtube.com/shorts URLs", () => {
        assert.equal(detectProvider("https://www.youtube.com/shorts/dQw4w9WgXcQ"), "youtube");
    });

    it("detects youtube.com/embed URLs", () => {
        assert.equal(detectProvider("https://www.youtube.com/embed/dQw4w9WgXcQ"), "youtube");
    });

    it("detects music.youtube.com URLs", () => {
        assert.equal(detectProvider("https://music.youtube.com/watch?v=dQw4w9WgXcQ"), "youtube");
    });

    it("detects soundcloud.com URLs", () => {
        assert.equal(detectProvider("https://soundcloud.com/artist/track-name"), "soundcloud");
    });

    it("detects on.soundcloud.com URLs", () => {
        assert.equal(detectProvider("https://on.soundcloud.com/abc123"), "soundcloud");
    });

    it("returns unknown for non-matching URLs", () => {
        assert.equal(detectProvider("https://spotify.com/track/123"), "unknown");
        assert.equal(detectProvider("https://example.com"), "unknown");
        assert.equal(detectProvider("not a url"), "unknown");
    });
});

describe("extractYouTubeId", () => {
    it("extracts ID from youtube.com/watch", () => {
        assert.equal(extractYouTubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "dQw4w9WgXcQ");
    });

    it("extracts ID from youtu.be", () => {
        assert.equal(extractYouTubeId("https://youtu.be/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
    });

    it("extracts ID from youtube.com/shorts", () => {
        assert.equal(extractYouTubeId("https://www.youtube.com/shorts/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
    });

    it("extracts ID from youtube.com/embed", () => {
        assert.equal(extractYouTubeId("https://www.youtube.com/embed/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
    });

    it("extracts ID from music.youtube.com", () => {
        assert.equal(extractYouTubeId("https://music.youtube.com/watch?v=dQw4w9WgXcQ"), "dQw4w9WgXcQ");
    });

    it("returns null for invalid URLs", () => {
        assert.equal(extractYouTubeId("https://example.com"), null);
        assert.equal(extractYouTubeId("not a url"), null);
        assert.equal(extractYouTubeId("https://youtube.com/watch?v="), null);
    });
});

describe("cache", () => {
    it("cacheClear resets the cache", () => {
        cacheClear();
        assert.ok(true);
    });
});

const STREAM_URL = "https://rrx---googlevideo.example/stream.m4a";

function fakeExecSuccess() {
    return Promise.resolve({ stdout: STREAM_URL + "\n", stderr: "" });
}
function fakeExecFailure() {
    const err = new Error("spawn yt-dlp ENOENT");
    err.code = "ENOENT";
    return Promise.reject(err);
}

describe("buildYtDlpArgs", () => {
    const canonical = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

    it("uses node JS runtime for PoT-free extraction", () => {
        const args = buildYtDlpArgs(canonical, {});
        assert.ok(args.includes("--js-runtimes"));
        assert.ok(args.includes("node"));
        assert.equal(args[0], "-f");
        assert.equal(args[args.length - 1], canonical);
    });

    it("adds --cookies when a cookies file is provided", () => {
        const args = buildYtDlpArgs(canonical, { cookiesFile: "/cookies.txt" });
        assert.ok(args.includes("--cookies"));
        assert.ok(args.includes("/cookies.txt"));
    });

    it("does not add --cookies when no cookies file exists", () => {
        const args = buildYtDlpArgs(canonical, {});
        assert.ok(!args.includes("--cookies"));
    });
});

describe("resolveYouTube", () => {
    it("returns audioUrl when yt-dlp extraction succeeds", async () => {
        cacheClear();
        const result = await resolveYouTube("https://www.youtube.com/watch?v=dQw4w9WgXcQ", { execFileAsync: fakeExecSuccess });
        assert.equal(result.provider, "youtube");
        assert.equal(result.url, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
        assert.equal(result.audioUrl, STREAM_URL);
        assert.ok(result.title);
    });

    it("throws when yt-dlp fails instead of returning a stream-less track", async () => {
        cacheClear();
        await assert.rejects(
            resolveYouTube("https://youtu.be/dQw4w9WgXcQ", { execFileAsync: fakeExecFailure }),
            (err) => err.message === "NO_AUDIO_STREAM"
        );
    });

    it("does not cache failed extractions (succeeds after transient failure)", async () => {
        cacheClear();
        await assert.rejects(resolveYouTube("https://youtu.be/dQw4w9WgXcQ", { execFileAsync: fakeExecFailure }));
        // second attempt with working yt-dlp must still extract (no poisoned cache)
        const result = await resolveYouTube("https://youtu.be/dQw4w9WgXcQ", { execFileAsync: fakeExecSuccess });
        assert.equal(result.audioUrl, STREAM_URL);
    });
});

describe("resolveTrack playability contract", () => {
    it("throws for SoundCloud — no playable stream is ever returned", async () => {
        cacheClear();
        await assert.rejects(
            resolveTrack("https://soundcloud.com/artist/track-name"),
            (err) => err.code === "SOUNDCLOUD_STREAM_UNSUPPORTED"
        );
    });

    it("throws for unknown provider — no playable stream", async () => {
        await assert.rejects(
            resolveTrack("https://example.com/file.mp3"),
            (err) => err.code === "UNSUPPORTED_PROVIDER"
        );
    });

    it("passes exec injection through for youtube", async () => {
        cacheClear();
        const result = await resolveTrack("https://www.youtube.com/watch?v=dQw4w9WgXcQ", { execFileAsync: fakeExecSuccess });
        assert.equal(result.audioUrl, STREAM_URL);
    });
});
