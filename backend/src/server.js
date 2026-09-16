require("dotenv").config();
const express = require("express");
const http = require("http");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { createSocketServer } = require("./socket");
const MemoryRoomStore = require("./rooms/MemoryRoomStore");
const RoomService = require("./rooms/RoomService");
const { createUploadRouter } = require("./upload/uploadRouter");
const { createTrackRouter } = require("./track/trackRouter");

function createHttpServer() {
    const app = express();
    // Behind the traefik/Cloudflare chain, socket.io sees X-Forwarded-For and
    // express-rate-limit needs trust proxy to avoid ValidationError spam and
    // mis-identifying users (one hop: traefik).
    app.set("trust proxy", 1);
    const roomService = new RoomService(MemoryRoomStore);

    // Security headers (CSP relaxed for inline theme script; X-Frame denied; nosniff)
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "'unsafe-inline'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'", "data:", "blob:", "https:"],
                mediaSrc: ["'self'", "blob:", "https:"],
                connectSrc: ["'self'"],
                frameAncestors: ["'none'"]
            }
        },
        crossOriginResourcePolicy: { policy: "cross-origin" }
    }));

    // Middleware
    app.use(express.json({ limit: "100kb" }));

    // Global API rate limit: 300 requests / 15 min per IP (generous for normal use)
    const apiLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 300,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: "RATE_LIMITED", message: "Too many requests" },
        skip: (req) => req.path === "/" || req.path.startsWith("/uploads/")
    });
    app.use(apiLimiter);

    // CORS (inline — no npm dependency; mirrors socket config)
    const ALLOWED_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:3000";
    app.use((req, res, next) => {
        const origin = req.headers.origin;
        if (origin === ALLOWED_ORIGIN) {
            res.setHeader("Access-Control-Allow-Origin", origin);
        }
        if (req.method === "OPTIONS") {
            res.setHeader("Access-Control-Allow-Methods", "GET,POST");
            res.setHeader("Access-Control-Allow-Headers", "Content-Type");
            return res.sendStatus(204);
        }
        next();
    });

    // Test route
    app.get("/", (req, res) => {
        res.json({
            message: "Backend is running!"
        });
    });

    const server = http.createServer(app);
    const socketServer = createSocketServer(server, roomService);
    server.socketServer = socketServer;
    app.set("socketServer", socketServer.io);
    app.use(createUploadRouter(roomService));
    app.use(createTrackRouter(roomService));

    // Populate live proxy pool from Webshare API if PROXY_API_KEY is set.
    // Fire-and-forget; resolve builds pool lazily but this avoids a cold
    // miss on the first request.
    const { refreshProxyPool } = require("./track/proxyPool");
    refreshProxyPool().catch(() => {});

    return server;
}

if (require.main === module) {
    const PORT = process.env.PORT;
    createHttpServer().listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}

module.exports = { createHttpServer };