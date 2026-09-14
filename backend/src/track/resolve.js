const https = require("node:https");
const http = require("node:http");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

const YOUTUBE_PATTERNS = [
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})/,
    /(?:https?:\/\/)?youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /(?:https?:\/\/)?music\.youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})/,
];

const SOUNDCLOUD_PATTERNS = [
    /(?:https?:\/\/)?(?:www\.)?soundcloud\.com\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+/,
    /(?:https?:\/\/)?on\.soundcloud\.com\/[a-zA-Z0-9_-]+/,
];

const CACHE_MAX = 500;
const CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_RESPONSE_BYTES = 256 * 1024; // 256KB cap on external JSON responses

const cache = new Map();

function detectProvider(url) {
    if (YOUTUBE_PATTERNS.some((p) => p.test(url))) return "youtube";
    if (SOUNDCLOUD_PATTERNS.some((p) => p.test(url))) return "soundcloud";
    return "unknown";
}

function extractYouTubeId(url) {
    for (const pattern of YOUTUBE_PATTERNS) {
        const match = url.match(pattern);
        if (match && match[1]) return match[1];
    }
    return null;
}

function fetchJSON(url) {
    return new Promise((resolve, reject) => {
        const mod = url.startsWith("https") ? https : http;
        const req = mod.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
            if (res.statusCode < 200 || res.statusCode >= 300) {
                return reject(new Error(`HTTP ${res.statusCode}`));
            }
            let data = "";
            let size = 0;
            res.on("data", (chunk) => {
                size += chunk.length;
                if (size > MAX_RESPONSE_BYTES) {
                    req.destroy();
                    reject(new Error("response too large"));
                    return;
                }
                data += chunk;
            });
            res.on("end", () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(e); }
            });
        });
        req.on("error", reject);
        req.setTimeout(10000, () => { req.destroy(); reject(new Error("timeout")); });
    });
}

function postJSON(url, body, headers = {}) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const postData = JSON.stringify(body);
        const req = https.request({
            hostname: parsed.hostname,
            path: parsed.pathname + parsed.search,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(postData),
                "User-Agent": "com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12; eureka-user Build/SQ3A.220605.009.A1) gzip",
                ...headers,
            },
        }, (res) => {
            let data = "";
            let size = 0;
            res.on("data", (chunk) => {
                size += chunk.length;
                if (size > MAX_RESPONSE_BYTES) {
                    req.destroy();
                    reject(new Error("response too large"));
                    return;
                }
                data += chunk;
            });
            res.on("end", () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(e); }
            });
        });
        req.on("error", reject);
        req.setTimeout(10000, () => { req.destroy(); reject(new Error("timeout")); });
        req.write(postData);
        req.end();
    });
}

async function resolveYouTube(url) {
    const videoId = extractYouTubeId(url);
    if (!videoId) throw new Error("INVALID_YOUTUBE_URL");

    const canonical = `https://www.youtube.com/watch?v=${videoId}`;
    const cacheKey = `youtube:${videoId}`;
    const cached = cacheGet(cacheKey);
    if (cached) return { ...cached, url: canonical };

    // Get metadata from oEmbed
    let title = null;
    let artist = null;
    try {
        const oembed = await fetchJSON(`https://www.youtube.com/oembed?url=${encodeURIComponent(canonical)}&format=json`);
        title = oembed.title || null;
        artist = oembed.author_name || null;
    } catch {
        // ignore — metadata is optional
    }

    // Get audio stream URL via yt-dlp
    let audioUrl = null;
    try {
        const { stdout } = await execFileAsync("yt-dlp", [
            "-f", "bestaudio[ext=m4a]/bestaudio",
            "--get-url",
            canonical,
        ], { timeout: 30000 });
        audioUrl = stdout.trim() || null;
    } catch (err) {
        console.log("[solace:BE] yt-dlp failed", { videoId, error: err.message });
    }

    const result = {
        url: canonical,
        title,
        artist,
        artwork: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        duration: null,
        provider: "youtube",
        audioUrl,
    };
    cacheSet(cacheKey, result);
    return result;
}

async function resolveSoundCloud(url) {
    const canonical = url.startsWith("http") ? url : `https://${url}`;
    const cacheKey = `soundcloud:${canonical}`;
    const cached = cacheGet(cacheKey);
    if (cached) return { ...cached, url: canonical };

    try {
        const data = await fetchJSON(`https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(canonical)}`);
        const result = {
            url: canonical,
            title: data.title || null,
            artist: data.author_name || null,
            artwork: data.thumbnail_url || null,
            duration: null,
            provider: "soundcloud",
        };
        cacheSet(cacheKey, result);
        return result;
    } catch (err) {
        console.log("[solace:BE] resolveSoundCloud oEmbed failed", { url: canonical, error: err.message });
        throw err;
    }
}

function cacheGet(key) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > CACHE_TTL_MS) {
        cache.delete(key);
        return null;
    }
    return entry.value;
}

function cacheSet(key, value) {
    if (cache.size >= CACHE_MAX) {
        const oldest = cache.keys().next().value;
        cache.delete(oldest);
    }
    cache.set(key, { value, ts: Date.now() });
}

function cacheClear() {
    cache.clear();
}

async function resolveTrack(url) {
    const provider = detectProvider(url);
    if (provider === "youtube") return resolveYouTube(url);
    if (provider === "soundcloud") return resolveSoundCloud(url);
    return { url, title: null, artist: null, artwork: null, duration: null, provider: "unknown" };
}

module.exports = {
    detectProvider,
    extractYouTubeId,
    resolveTrack,
    resolveYouTube,
    resolveSoundCloud,
    cacheClear,
};
