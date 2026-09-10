const { SERVER } = require("../events");

function createWallpaperHandler(io, roomService) {
    function emitError(socket, err) {
        socket.emit(SERVER.ROOM_ERROR, { code: err.code, message: err.message });
    }

    return {
        handleSetWallpaper(socket, payload) {
            try {
                const room = roomService.resolveRoomBySocket(socket.id);
                if (!room) {
                    const err = new Error("Room not found");
                    err.code = "ROOM_NOT_FOUND";
                    console.log("[solace:BE] wallpaper:set room missing", { from: socket.id, code: err.code });
                    emitError(socket, err);
                    return;
                }
                const url = payload && payload.url;
                const kind = payload && payload.kind;
                console.log("[solace:BE] wallpaper:set received", {
                    from: socket.id,
                    roomId: room.id,
                    urlLength: typeof url === "string" ? url.length : 0,
                    kind
                });
                const { room: updatedRoom, url: newUrl, kind: newKind } = roomService.setWallpaper(room.id, socket.id, url, kind);
                console.log("[solace:BE] wallpaper:set applied", {
                    roomId: updatedRoom.id,
                    from: socket.id,
                    newUrlLength: newUrl ? newUrl.length : 0,
                    newKind
                });
                // io.to(room.id) includes the originator so every member holds
                // the same canonical wallpaper state, not just new remote ones.
                io.to(updatedRoom.id).emit(SERVER.WALLPAPER_STATE, {
                    url: newUrl,
                    kind: newKind,
                    changedBy: socket.id,
                    updatedAt: updatedRoom.state.wallpaper.updatedAt
                });
                console.log("[solace:BE] wallpaper:state broadcast", {
                    roomId: updatedRoom.id,
                    from: socket.id,
                    urlLength: newUrl ? newUrl.length : 0,
                    kind: newKind
                });
                const member = updatedRoom.members.get(socket.id);
                const actor = { socketId: socket.id, displayName: member ? member.displayName : "unknown" };
                const detail = newKind === "video" ? `set video wallpaper ${newUrl}` : `set wallpaper ${newUrl}`;
                const { entry } = roomService.appendActivity(updatedRoom.id, { type: "wallpaper", actor, detail });
                io.to(updatedRoom.id).emit(SERVER.ROOM_ACTIVITY, { entry });
            } catch (err) {
                console.log("[solace:BE] wallpaper:set error", { from: socket.id, code: err.code, message: err.message });
                emitError(socket, err);
            }
        }
    };
}

module.exports = createWallpaperHandler;