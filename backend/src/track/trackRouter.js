const express = require("express");
const https = require("node:https");
const { resolveTrack } = require("./resolve");

function createTrackRouter() {
    const router = express.Router();

    router.post("/track/resolve", async (req, res) => {
        const { url } = req.body || {};
        if (!url || typeof url !== "string") {
            return res.status(400).json({ error: "MISSING_URL" });
        }

        console.log("[solace:BE] track resolve", { url: url.slice(0, 120) });

        try {
            const result = await resolveTrack(url);
            console.log("[solace:BE] track resolved", { provider: result.provider, title: result.title });
            res.json(result);
        } catch (err) {
            console.log("[solace:BE] track resolve FAILED", { url: url.slice(0, 120), error: err.message });
            res.status(422).json({ error: "RESOLVE_FAILED", message: "Couldn't resolve track metadata" });
        }
    });

    // Proxy audio stream — fetches from YouTube and pipes back with CORS headers
    router.get("/track/proxy", (req, res) => {
        const { url } = req.query;
        if (!url || typeof url !== "string") {
            return res.status(400).json({ error: "MISSING_URL" });
        }

        // Only allow proxying googlevideo.com URLs
        try {
            const parsed = new URL(url);
            if (!parsed.hostname.endsWith(".googlevideo.com")) {
                return res.status(403).json({ error: "FORBIDDEN" });
            }
        } catch {
            return res.status(400).json({ error: "INVALID_URL" });
        }

        // Forward range requests for seeking support
        const headers = {};
        if (req.headers.range) {
            headers.Range = req.headers.range;
        }

        const proxyReq = https.get(url, { headers }, (proxyRes) => {
            // Forward relevant headers from YouTube
            const fwdHeaders = {
                "Content-Type": proxyRes.headers["content-type"] || "audio/mp4",
                "Accept-Ranges": "bytes",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
                "Access-Control-Allow-Headers": "Range",
            };
            if (proxyRes.headers["content-length"]) {
                fwdHeaders["Content-Length"] = proxyRes.headers["content-length"];
            }
            if (proxyRes.headers["content-range"]) {
                fwdHeaders["Content-Range"] = proxyRes.headers["content-range"];
            }

            const statusCode = proxyRes.statusCode === 206 ? 206 : 200;
            res.writeHead(statusCode, fwdHeaders);
            proxyRes.pipe(res);
        });

        proxyReq.on("error", (err) => {
            console.log("[solace:BE] proxy error", { error: err.message });
            if (!res.headersSent) {
                res.status(502).json({ error: "PROXY_ERROR" });
            }
        });
    });

    // Handle CORS preflight
    router.options("/track/proxy", (req, res) => {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Range");
        res.sendStatus(204);
    });

    return router;
}

module.exports = { createTrackRouter };
