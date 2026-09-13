require("dotenv").config();
const express = require("express");
const http = require("http");
const { createSocketServer } = require("./socket");
const MemoryRoomStore = require("./rooms/MemoryRoomStore");
const RoomService = require("./rooms/RoomService");
const { createUploadRouter } = require("./upload/uploadRouter");
const { createTrackRouter } = require("./track/trackRouter");

function createHttpServer() {
    const app = express();

    // Middleware
    app.use(express.json());

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

    const roomService = new RoomService(MemoryRoomStore);
    const server = http.createServer(app);
    const socketServer = createSocketServer(server, roomService);
    server.socketServer = socketServer;
    app.set("socketServer", socketServer.io);
    app.use(createUploadRouter(roomService));
    app.use(createTrackRouter());
    return server;
}

if (require.main === module) {
    const PORT = process.env.PORT;
    createHttpServer().listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}

module.exports = { createHttpServer };