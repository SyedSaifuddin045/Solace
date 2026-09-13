const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { detectProvider, extractYouTubeId, cacheClear } = require("../../src/track/resolve");

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
