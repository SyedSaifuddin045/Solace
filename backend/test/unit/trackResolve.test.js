const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { detectProvider, extractYouTubeId, cacheClear, normalizeProxy, buildProxyPool, buildYtDlpArgs, resolveYouTube, resolveTrack, refreshTrack } = require("../../src/track/resolve");

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

    it("adds --proxy when a residential proxy is configured", () => {
        const args = buildYtDlpArgs(canonical, { proxy: "socks5://u:p@127.0.0.1:1080" });
        assert.ok(args.includes("--proxy"));
        assert.ok(args.includes("socks5://u:p@127.0.0.1:1080"));
    });
});

describe("normalizeProxy / buildProxyPool", () => {
    it("normalizes webshare dashboard format host:port:user:pass", () => {
        assert.equal(
            normalizeProxy("45.38.107.97:6014:wuoscekm:irxip6u6yr5v"),
            "http://wuoscekm:irxip6u6yr5v@45.38.107.97:6014"
        );
    });

    it("passes through standard proxy URLs", () => {
        assert.equal(normalizeProxy("http://u:p@h:80"), "http://u:p@h:80");
        assert.equal(normalizeProxy("socks5://u:p@h:1080"), "socks5://u:p@h:1080");
    });

    it("builds a pool from comma-separated env list", () => {
        const pool = buildProxyPool({ proxy: "h1:1:u:p, http://u:p@h2:80, socks5://u:p@h3:1080" });
        assert.equal(pool.length, 3);
        assert.deepEqual(pool[0], "http://u:p@h1:1");
        assert.equal(pool[1], "http://u:p@h2:80");
        assert.equal(pool[2], "socks5://u:p@h3:1080");
    });

    it("returns empty pool when no proxy configured", () => {
        assert.deepEqual(buildProxyPool({}), []);
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

    it("rotates to the next proxy when the first fails", async () => {
        cacheClear();
        const seen = [];
        const rotatingExec = async (bin, args) => {
            const proxy = args[args.indexOf("--proxy") + 1] || "direct";
            seen.push(proxy);
            if (proxy === "http://u:p@bad:1") {
                const err = new Error("HTTP Error 429: Too Many Requests");
                throw err;
            }
            return Promise.resolve({ stdout: STREAM_URL + "\n", stderr: "" });
        };
        const result = await resolveYouTube("https://youtu.be/dQw4w9WgXcQ", {
            execFileAsync: rotatingExec,
            proxy: "http://u:p@bad:1,http://u:p@good:2",
        });
        assert.equal(result.audioUrl, STREAM_URL);
        assert.deepEqual(seen, ["http://u:p@bad:1", "http://u:p@good:2"]);
    });

    it("cache hit on second resolve within TTL returns a FRESH audioUrl (stale signed URL bug)", async () => {
        cacheClear();
        let calls = 0;
        const perCallExec = async () => {
            calls += 1;
            return Promise.resolve({ stdout: STREAM_URL + "-" + calls + "\n", stderr: "" });
        };
        const first = await resolveYouTube("https://www.youtube.com/watch?v=dQw4w9WgXcQ", { execFileAsync: perCallExec });
        const second = await resolveYouTube("https://www.youtube.com/watch?v=dQw4w9WgXcQ", { execFileAsync: perCallExec });
        assert.equal(calls, 2, "second resolve must re-run yt-dlp extraction even on cache hit");
        assert.equal(second.audioUrl, STREAM_URL + "-2", "cache hit must hand out a fresh audioUrl, not the cached signed URL");
        assert.notEqual(second.audioUrl, first.audioUrl);
        assert.equal(second.title, first.title, "metadata should still be served from the cache");
    });

    it("refreshes the proxy pool once and retries when the live pool is exhausted", async () => {
        cacheClear();
        const savedKey = process.env.PROXY_API_KEY;
        process.env.PROXY_API_KEY = "test-key";
        try {
            let refreshes = 0;
            const failingExec = async () => {
                const err = new Error("HTTP Error 429: Too Many Requests");
                throw err;
            };
            await assert.rejects(
                resolveYouTube("https://youtu.be/dQw4w9WgXcQ", {
                    execFileAsync: failingExec,
                    refreshProxyPool: async () => { refreshes++; return []; },
                }),
                (err) => err.message === "NO_AUDIO_STREAM"
            );
            assert.equal(refreshes, 1, "pool should refresh exactly once after exhausted attempts");
        } finally {
            if (savedKey === undefined) delete process.env.PROXY_API_KEY;
            else process.env.PROXY_API_KEY = savedKey;
        }
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

describe("refreshTrack", () => {
    const YT_TRACK = {
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        title: "Old Title",
        artist: "Old Artist",
        artwork: "old.jpg",
        duration: 42,
        provider: "youtube",
        audioUrl: "https://stale.example/old.m4a",
        embeddable: true,
    };

    it("returns non-youtube tracks unchanged (uploads / soundcloud never refreshed)", async () => {
        const t = { url: "http://t/1", provider: "upload", audioUrl: "http://t/1.aac" };
        const result = await refreshTrack(t);
        assert.equal(result, t);
    });

    it("returns null/undefined tracks unchanged", async () => {
        assert.equal(await refreshTrack(null), null);
        assert.equal(await refreshTrack(undefined), undefined);
    });

    it("never throws and keeps the original track when extraction fails", async () => {
        const result = await refreshTrack({ ...YT_TRACK }, { execFileAsync: fakeExecFailure });
        assert.equal(result.audioUrl, YT_TRACK.audioUrl);
        assert.equal(result.title, YT_TRACK.title);
    });

    it("refreshes audioUrl and merges fresh metadata for youtube tracks", async () => {
        const result = await refreshTrack({ ...YT_TRACK }, { execFileAsync: fakeExecSuccess });
        assert.equal(result.audioUrl, STREAM_URL);
        assert.equal(result.url, YT_TRACK.url, "track identity URL must be preserved");
        assert.equal(result.provider, "youtube");
    });
});
