const express = require("express");
const multer = require("multer");
const path = require("node:path");
const rateLimit = require("express-rate-limit");
const { createUploadStore, UnsupportedMediaError, StorageLimitError, MAX_FILE_BYTES } = require("./uploadStore");
const { SERVER } = require("../socket/events");

function createUploadRouter(roomService) {
    const store = createUploadStore();
    const router = express.Router();
    const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES } });

    // Per-IP upload throttling: 10 uploads / 15 min per IP
    const uploadLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 10,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: "RATE_LIMITED", message: "Too many uploads" }
    });

    router.get("/uploads/:roomId/:file", (req, res) => {
        const ext = "." + req.params.file.split(".").pop();
        console.log("[solace:BE] upload GET serve", { roomId: req.params.roomId, filename: req.params.file, ext, contentType: store.contentTypeOf(ext) });
        res.set("Cache-Control", "public, max-age=31536000, immutable");
        res.set("Content-Type", store.contentTypeOf(ext));
        res.set("X-Content-Type-Options", "nosniff");
        res.sendFile(path.join(req.params.roomId, req.params.file), { root: store.root }, (err) => {
            if (err) {
                console.log("[solace:BE] upload GET 404", { roomId: req.params.roomId, filename: req.params.file });
                res.status(404).json({ error: "NOT_FOUND" });
            }
        });
    });

    // Membership gate: require socketId that belongs to the room being uploaded to
    function assertMemberOf(req, res) {
        const { roomId, socketId } = req.body || {};
        // Validate roomId format
        const { ROOM_ID_PATTERN } = require("../rooms/RoomService");
        if (typeof roomId !== "string" || !ROOM_ID_PATTERN.test(roomId)) {
            res.status(400).json({ error: "INVALID_ROOM_ID" });
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
        return { roomId, room };
    }

    router.post("/uploads", uploadLimiter, upload.single("file"), async (req, res) => {
        const auth = assertMemberOf(req, res);
        if (!auth) return;
        const { roomId, room } = auth;
        const file = req.file;
        console.log("[solace:BE] upload POST received", {
            roomId,
            originalname: file && file.originalname,
            size: file && file.size,
            mimetype: file && file.mimetype
        });
        if (!file) {
            console.log("[solace:BE] upload POST MISSING_FILE", { roomId });
            return res.status(400).json({ error: "MISSING_FILE" });
        }
        let meta;
        try {
            meta = await store.buildMeta(roomId, file.originalname, file.buffer, file.size, roomId, Date.now());
        } catch (err) {
            if (err instanceof UnsupportedMediaError) {
                console.log("[solace:BE] upload POST UNSUPPORTED_MEDIA_TYPE", { roomId, originalname: file.originalname });
                return res.status(415).json({ error: err.code });
            }
            if (err instanceof StorageLimitError) {
                console.log("[solace:BE] upload POST STORAGE_LIMIT_REACHED", { roomId });
                return res.status(507).json({ error: err.code });
            }
            throw err;
        }
        console.log("[solace:BE] upload POST magic-type result", { roomId, url: meta.url, kind: meta.kind, contentType: meta.contentType });
        const { room: updatedRoom, uploads, evicted } = roomService.addUpload(roomId, meta);
        console.log("[solace:BE] upload POST addUpload result", { roomId, uploadsLength: uploads.length, evicted: evicted ? evicted.url : null });
        if (evicted) await store.deleteByUrl(evicted.url);
        const io = req.app.get("socketServer");
        if (io) {
            io.to(roomId).emit(SERVER.WALLPAPER_UPLOADS, { uploads });
            const member = updatedRoom.members.get("upload");
            const actor = { socketId: "upload", displayName: member ? member.displayName : "unknown" };
            const { entry } = roomService.appendActivity(updatedRoom.id, { type: "wallpaper", actor, detail: `uploaded ${meta.originalName}` });
            io.to(roomId).emit(SERVER.ROOM_ACTIVITY, { entry });
        }
        res.status(201).json({ id: meta.id, url: meta.url, kind: meta.kind, size: meta.size });
        console.log("[solace:BE] upload POST response", { status: 201, id: meta.id, url: meta.url, kind: meta.kind, size: meta.size });
    });

    router.use((err, req, res, next) => {
        if (err instanceof multer.MulterError) {
            if (err.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "PAYLOAD_TOO_LARGE" });
            return res.status(400).json({ error: "BAD_REQUEST", message: err.code });
        }
        next(err);
    });

    return router;
}

module.exports = { createUploadRouter, MAX_FILE_BYTES };