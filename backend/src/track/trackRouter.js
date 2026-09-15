const express = require("express");
const https = require("node:https");
const rateLimit = require("express-rate-limit");
const { resolveTrack } = require("./resolve");

function createTrackRouter(roomService) {
    const router = express.Router();
    const ALLOWED_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:3000";
    const PROXY_TIMEOUT_MS = 30_000;
    const PROXY_MAX_BYTES = 100 * 1024 * 1024; // 100MB cap per proxied response

    const resolveLimiter = rateLimit({
        windowMs: 60 * 1000,
        max: 10,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: "RATE_LIMITED", message: "Too many resolve requests" }
    });

    const proxyLimiter = rateLimit({
        windowMs: 60 * 1000,
        max: 30,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: "RATE_LIMITED", message: "Too many proxy requests" }
    });

    // Membership gate for endpoints that need a room
    function assertMember(req, res) {
        const { roomId, socketId } = req.query || {};
        const { ROOM_ID_PATTERN } = require("../rooms/RoomService");
        if (typeof roomId !== "string" || !ROOM_ID_PATTERN.test(roomId)) {
            res.status(400).json({ error: "MISSING_ROOM" });
            return null;
        }
        if (typeof socketId !== "string" || socketId.length === 0) {
            res.status(403).json({ error: "FORBIDDEN", message: "socketId required" });
            return null;
        }
        const room = roomService.resolveRoomBySocket(socketId);
        if (!room || room.id !== roomId) {
            res.status(403).json({ error: "FORBIDDEN", message: "Not a member of this room" });
            return null;
        }
        return room;
    }

    router.post("/track/resolve", resolveLimiter, async (req, res) => {
        const { url } = req.body || {};
        if (!url || typeof url !== "string") {
            return res.status(400).json({ error: "MISSING_URL" });
        }
        if (url.length > 2048) {
            return res.status(400).json({ error: "URL_TOO_LONG" });
        }

        console.log("[solace:BE] track resolve", { url: url.slice(0, 120) });

        try {
            const result = await resolveTrack(url);
            console.log("[solace:BE] track resolved", { provider: result.provider, title: result.title });
            res.json(result);
        } catch (err) {
            console.log("[solace:BE] track resolve FAILED", { url: url.slice(0, 120), error: err.message, code: err.code });
            const messages = {
                NO_AUDIO_STREAM: "Couldn't fetch a playable stream for this track (YouTube may have blocked it here). Try another song.",
                SOUNDCLOUD_STREAM_UNSUPPORTED: "SoundCloud playback isn't available yet — paste a YouTube link instead.",
                UNSUPPORTED_PROVIDER: "Only YouTube links can be played right now.",
            };
            res.status(422).json({ error: "RESOLVE_FAILED", message: messages[err.code] || "Couldn't resolve track metadata" });
        }
    });

    // Proxy audio stream — requires room membership, rate-limited, time-bounded
    router.get("/track/proxy", proxyLimiter, (req, res) => {
        const room = assertMember(req, res);
        if (!room) return;

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

        const proxyReq = https.get(url, { headers, timeout: PROXY_TIMEOUT_MS }, (proxyRes) => {
            // Forward relevant headers from YouTube — pin CORS to CLIENT_ORIGIN
            const fwdHeaders = {
                "Content-Type": proxyRes.headers["content-type"] || "audio/mp4",
                "Accept-Ranges": "bytes",
                "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
                "X-Content-Type-Options": "nosniff",
            };
            if (proxyRes.headers["content-length"]) {
                fwdHeaders["Content-Length"] = proxyRes.headers["content-length"];
            }
            if (proxyRes.headers["content-range"]) {
                fwdHeaders["Content-Range"] = proxyRes.headers["content-range"];
            }

            const statusCode = proxyRes.statusCode === 206 ? 206 : 200;
            res.writeHead(statusCode, fwdHeaders);

            // Bound response size — abort downstream after cap
            let forwarded = 0;
            proxyRes.on("data", (chunk) => {
                forwarded += chunk.length;
                if (forwarded > PROXY_MAX_BYTES) {
                    proxyRes.destroy();
                    if (!res.headersSent) {
                        res.status(502).json({ error: "PROXY_TOO_LARGE" });
                    } else {
                        res.destroy();
                    }
                    return;
                }
                res.write(chunk);
            });
            proxyRes.on("end", () => res.end());
            proxyRes.on("error", () => { if (!res.headersSent) res.status(502).json({ error: "PROXY_ERROR" }); else res.destroy(); });
        });

        proxyReq.on("timeout", () => {
            proxyReq.destroy();
            if (!res.headersSent) {
                res.status(504).json({ error: "PROXY_TIMEOUT" });
            }
        });
        proxyReq.on("error", (err) => {
            console.log("[solace:BE] proxy error", { error: err.message });
            if (!res.headersSent) {
                res.status(502).json({ error: "PROXY_ERROR" });
            }
        });
    });

    // Handle CORS preflight — proper origin check instead of wildcard
    router.options("/track/proxy", (req, res) => {
        const origin = req.headers.origin;
        res.setHeader("Access-Control-Allow-Origin", origin === ALLOWED_ORIGIN ? origin : "null");
        res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Range");
        res.sendStatus(204);
    });

    return router;
}

module.exports = { createTrackRouter };