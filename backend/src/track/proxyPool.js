// Runtime proxy pool for yt-dlp extraction.
//
// Prefers proxies fetched live from Webshare's API (PROXY_API_KEY env,
// https://api.webshare.io/api/v2/proxy/list) so dead/rotating exits are
// self-healing without redeploys. Falls back to the static YT_DLP_PROXY env
// list, then to no proxy at all (direct extraction, dev/local).

const https = require("node:https");

const WEBSHARE_API = "https://api.webshare.io/api/v2/proxy/list/";

function normalizeProxy(entry) {
    if (/^[a-z0-9]+:\/\//i.test(entry)) return entry;
    const m = entry.match(/^([^:]+):(\d+):([^:]+):(.+)$/);
    if (m) return `http://${m[3]}:${m[4]}@${m[1]}:${m[2]}`;
    return entry;
}

function parseStaticPool(raw) {
    return (raw || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map(normalizeProxy);
}

function staticEnvPool() {
    return parseStaticPool(process.env.YT_DLP_PROXY);
}

let apiPool = [];
let lastFetch = 0;
const REFRESH_MIN_INTERVAL_MS = 60_000; // don't hammer Webshare API

function getApiKey() {
    return process.env.PROXY_API_KEY || "";
}

function webshareFetch(apiKey, httpGet = httpsGet) {
    return httpGet(`${WEBSHARE_API}?page_size=100`, {
        Authorization: `Bearer ${apiKey}`,
        "User-Agent": "solace-backend",
    });
}

function httpsGet(url, headers) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { headers }, (res) => {
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error(`Webshare API HTTP ${res.statusCode}`));
            }
            let data = "";
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(e); }
            });
        });
        req.on("error", reject);
        req.setTimeout(15000, () => { req.destroy(); reject(new Error("Webshare API timeout")); });
    });
}

async function refreshProxyPool(opts = {}) {
    const apiKey = opts.apiKey || getApiKey();
    const now = Date.now();
    if (!opts.force && now - lastFetch < REFRESH_MIN_INTERVAL_MS) return getProxyPool();
    if (!apiKey) {
        apiPool = [];
        return [];
    }
    try {
        const body = await webshareFetch(apiKey, opts.httpGet);
        const results = Array.isArray(body?.results) ? body.results : [];
        const pool = results
            .filter((p) => p && p.valid !== false && p.proxy_address && p.port && p.username && p.password)
            .map((p) => `http://${p.username}:${p.password}@${p.proxy_address}:${p.port}`);
        if (pool.length > 0) {
            apiPool = pool;
            lastFetch = now;
            console.log(`[solace:BE] proxy pool refreshed: ${pool.length} exits (webshare)`);
        } else {
            console.log("[solace:BE] webshare returned no valid proxies; keeping existing pool");
        }
    } catch (err) {
        console.log("[solace:BE] webshare proxy fetch failed", { error: err.message });
    }
    return getProxyPool();
}

function getProxyPool() {
    if (apiPool.length > 0) return apiPool;
    const staticPool = staticEnvPool();
    return staticPool;
}

module.exports = {
    normalizeProxy,
    parseStaticPool,
    refreshProxyPool,
    getProxyPool,
    _test: { webshareFetch, httpsGet },
};