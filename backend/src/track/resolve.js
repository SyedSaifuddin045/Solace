const https = require("node:https");
const http = require("node:http");
const fs = require("node:fs");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { normalizeProxy, getProxyPool, refreshProxyPool } = require("./proxyPool");

const execFileAsyncReal = promisify(execFile);

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

// YouTube now requires a JS runtime (PoT challenge) for many videos, and bot
// checks datacenter IPs hard. node is baked into the image; an exit pool
// (YT_DLP_PROXY — comma-separated proxies) rotates around the wall.
// Accepted forms per entry:
//   "http://user:pass@host:port"        (standard)
//   "socks5://user:pass@host:port"      (standard)
//   "host:port:user:pass"               (Webshare dashboard copy-paste)
// A cookies file (backend/cookies.txt or YT_COOKIES_FILE) also helps.
// Proxy pool order: explicit opts.proxy (tests) > live Webshare API pool
// (PROXY_API_KEY) > static YT_DLP_PROXY env list > direct.
function buildProxyPool(opts = {}) {
    if (opts.proxy) {
        return opts.proxy
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
            .map(normalizeProxy);
    }
    return getProxyPool();
}

function buildYtDlpArgs(canonical, opts = {}) {
    const args = [
        "-f", "bestaudio[ext=m4a]/bestaudio",
        "--get-url",
        "--js-runtimes", "node",
        canonical,
    ];
    const proxy = opts.proxy || process.env.YT_DLP_PROXY;
    if (proxy) {
        args.splice(args.length - 1, 0, "--proxy", proxy);
    }
    const cookiesPath =
        opts.cookiesFile || process.env.YT_COOKIES_FILE || (fs.existsSync("cookies.txt") ? "cookies.txt" : null);
    if (cookiesPath) {
        args.splice(args.length - 1, 0, "--cookies", cookiesPath);
    }
    return args;
}

// Cap attempts: a working proxy extracts in 2-5s; beyond 4 dead ends just
// eats user time and YouTube rate-limit quota.
const MAX_PROXY_ATTEMPTS = 4;

async function resolveYouTube(url, opts = {}) {
    const videoId = extractYouTubeId(url);
    if (!videoId) throw new Error("INVALID_YOUTUBE_URL");

    const canonical = `https://www.youtube.com/watch?v=${videoId}`;
    const cacheKey = `youtube:${videoId}`;
    // CACHE SPLIT: the cached entry holds METADATA ONLY (url, title, artist,
    // artwork, provider, embeddable). NEVER audioUrl — YouTube signed stream
    // URLs expire within minutes, so handing out a cached one is handing out a
    // dead URL (stream 403/502 -> embed fallback). A cache hit still re-runs
    // the yt-dlp extraction below to mint a fresh audioUrl.
    const cached = cacheGet(cacheKey);

    // Get metadata from oEmbed — best effort, never fatal. Only on a cache
    // miss; title/artist/embeddable are stable within the TTL.
    let title = null;
    let artist = null;
    let embeddable = false;
    if (!cached) {
        try {
            const oembed = await fetchJSON(`https://www.youtube.com/oembed?url=${encodeURIComponent(canonical)}&format=json`);
            title = oembed.title || null;
            artist = oembed.author_name || null;
            embeddable = !!oembed.html;
        } catch {
            // ignore — metadata is optional
        }
    } else {
        title = cached.title;
        artist = cached.artist;
        embeddable = cached.embeddable === true;
    }

    // Get audio stream URL via yt-dlp. A track without a playable stream is a
    // silent failure on every client (no play, no progress, no seek) — so a
    // failed extraction MUST reject, never resolve with audioUrl null.
    // Proxy pool rotates on failure (individual datacenter exits 429/block);
    // when the whole live pool is exhausted, refresh from Webshare once and
    // retry (self-healing without redeploys).
    const execFileAsync = opts.execFileAsync || execFileAsyncReal;
    let audioUrl = null;
    let lastErr = null;
    let refreshedOnce = false;
    outer: for (let pass = 0; pass < 2; pass++) {
        const pool = buildProxyPool(opts);
        const attempts = pool.length > 0 ? pool.slice(0, MAX_PROXY_ATTEMPTS) : [null];
        for (const proxy of attempts) {
            try {
                const args = buildYtDlpArgs(canonical, proxy ? { ...opts, proxy } : opts);
                const { stdout } = await execFileAsync("yt-dlp", args, { timeout: 30000 });
                const url = stdout.trim();
                if (url && /^https?:\/\//.test(url)) {
                    audioUrl = url;
                    break outer;
                }
                lastErr = new Error("empty stream output");
            } catch (err) {
                lastErr = err;
                console.log("[solace:BE] yt-dlp failed", { videoId, proxy: proxy || "direct", error: err.message });
            }
        }
        if (refreshedOnce || opts.proxy) break;
        if (!process.env.PROXY_API_KEY) break;
        const doRefresh = opts.refreshProxyPool || refreshProxyPool;
        await doRefresh({ force: true });
        refreshedOnce = true;
    }
    if (!audioUrl) {
        const err = new Error("NO_AUDIO_STREAM");
        err.code = "NO_AUDIO_STREAM";
        err.cause = lastErr;
        err.embeddable = embeddable;
        // Carry metadata so the client can render a YouTube embed fallback
        err.title = title;
        err.artist = artist;
        err.artwork = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
        throw err;
    }

    const result = {
        url: canonical,
        title,
        artist,
        artwork: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        duration: null,
        provider: "youtube",
        audioUrl,
        embeddable,
    };
    // Cache METADATA ONLY (see the split above) and only on success — a failed
    // extraction must never poison the cache (it also leaves nothing for the
    // failure path, which throws long before this line).
    if (!cached) {
        cacheSet(cacheKey, {
            url: canonical,
            title,
            artist,
            artwork: result.artwork,
            duration: null,
            provider: "youtube",
            embeddable,
        });
    }
    return result;
}

async function resolveSoundCloud(url) {
    // SoundCloud streams require an authenticated client_id dance and are
    // frequently blocked from datacenter IPs. Returning metadata without a
    // stream URL produces silent dead playback on every client — so reject
    // loudly instead of pretending the track is playable.
    const err = new Error("SOUNDCLOUD_STREAM_UNSUPPORTED");
    err.code = "SOUNDCLOUD_STREAM_UNSUPPORTED";
    throw err;
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

async function resolveTrack(url, opts = {}) {
    const provider = detectProvider(url);
    if (provider === "youtube") return resolveYouTube(url, opts);
    if (provider === "soundcloud") return resolveSoundCloud(url);
    if (provider === "unknown") {
        // The proxy only relays googlevideo URLs; a bare audio URL can never
        // play through it. Fail loudly rather than shipping a dead track.
        const err = new Error("UNSUPPORTED_PROVIDER");
        err.code = "UNSUPPORTED_PROVIDER";
        throw err;
    }
}

// Best-effort room refresh: replace a track's signed audioUrl (captured at add
// time, likely expired by play time) with a fresh one, merging in any fresher
// metadata. Non-youtube tracks (uploads, soundcloud) and any failure return the
// track UNCHANGED — never throws, callers treat this as best-effort.
async function refreshTrack(track, opts = {}) {
    if (!track || typeof track !== "object" || typeof track.url !== "string") return track;
    try {
        if (detectProvider(track.url) !== "youtube") return track;
        const fresh = await resolveTrack(track.url, opts);
        if (!fresh || !fresh.audioUrl) return track;
        return {
            ...track,
            audioUrl: fresh.audioUrl,
            ...(fresh.title != null ? { title: fresh.title } : {}),
            ...(fresh.artist != null ? { artist: fresh.artist } : {}),
            ...(fresh.artwork != null ? { artwork: fresh.artwork } : {}),
            ...(fresh.embeddable != null ? { embeddable: fresh.embeddable } : {}),
            ...(fresh.duration != null ? { duration: fresh.duration } : {}),
        };
    } catch (err) {
        console.log("[solace:BE] refreshTrack failed", { url: track.url, error: err.message });
        return track;
    }
}

module.exports = {
    detectProvider,
    extractYouTubeId,
    normalizeProxy,
    buildProxyPool,
    buildYtDlpArgs,
    resolveTrack,
    resolveYouTube,
    resolveSoundCloud,
    refreshTrack,
    cacheClear,
};
