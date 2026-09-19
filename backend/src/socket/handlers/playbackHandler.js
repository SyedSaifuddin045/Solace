const { SERVER } = require("../events");

function createPlaybackHandler(io, roomService) {
    function emitError(socket, err) {
        socket.emit(SERVER.ROOM_ERROR, { code: err.code, message: err.message });
    }

    function emitOrError(socket, err) {
        emitError(socket, err);
        return null;
    }

    // io.to(room.id) includes the originator: all room members see the same
    // canonical playback state, keeping every client in lockstep.
    function broadcast(room, change, changedBy) {
        io.to(room.id).emit(SERVER.PLAYBACK_STATE, {
            status: change.status,
            track: change.track,
            position: change.position,
            updatedAt: change.updatedAt,
            changedBy
        });
    }

    function assertRoom(socket) {
        const room = roomService.resolveRoomBySocket(socket.id);
        if (!room) {
            const err = new Error("Not a member of this room");
            err.code = "NOT_IN_ROOM";
            return emitOrError(socket, err);
        }
        return room;
    }

    function appendActivity(room, socket, detail) {
        const member = room.members.get(socket.id);
        const actor = { socketId: socket.id, displayName: member ? member.displayName : "unknown" };
        const { entry } = roomService.appendActivity(room.id, { type: "playback", actor, detail });
        io.to(room.id).emit(SERVER.ROOM_ACTIVITY, { entry });
    }

    function broadcastQueue(room, queue) {
        io.to(room.id).emit(SERVER.PLAYBACK_QUEUE_STATE, { queue });
    }

    // Best-effort refresh of a just-started YouTube track. The audioUrl in
    // room state may be a stale signed googlevideo URL captured at add/queue
    // time — YouTube lets it expire within minutes, turning the stream into a
    // 403/502 and flipping clients to the embed fallback. Re-extract fresh on
    // the way out and hot-swap every client to the new URL when it differs
    // (the frontend AudioPlayer reloads on src change). NEVER blocks the
    // original broadcast (that fires immediately); ANY failure here logs and
    // keeps the state already on the wire.
    async function refreshTrackBroadcast(room, change, socket) {
        try {
            if (!roomService.refreshTrack) return;
            const track = change.track;
            if (!track || !track.url) return;
            if (room.members.size === 0) return;
            const refreshed = await roomService.refreshTrack(track);
            if (!refreshed || !refreshed.url) return;
            if (refreshed.audioUrl === track.audioUrl) return;
            const { room: updatedRoom } = roomService.setPlayback(room.id, socket.id, {
                status: "playing",
                track: refreshed,
                position: 0,
            });
            broadcast(updatedRoom, { ...change, track: refreshed }, socket.id);
        } catch (err) {
            console.log("[solace:BE] playback refresh failed — keeping original broadcast", {
                roomId: room && room.id,
                error: err.message,
                code: err.code,
            });
        }
    }

    return {
        handlePlay(socket, payload) {
            const room = assertRoom(socket);
            if (!room) return;
            try {
                const track = payload && payload.track;
                const { room: updatedRoom, change, queue, popped } = roomService.advancePlay(room.id, socket.id, { track });
                broadcast(updatedRoom, change, socket.id);
                // Auto-advance consumed the queue head — keep every member's
                // queue in lockstep with the atomically-popped canonical queue.
                if (popped) broadcastQueue(updatedRoom, queue);
                appendActivity(updatedRoom, socket, change.track ? `played ${change.track.url}` : "played");
                refreshTrackBroadcast(updatedRoom, change, socket);
            } catch (err) {
                emitError(socket, err);
            }
        },

        handlePause(socket, payload) {
            const room = assertRoom(socket);
            if (!room) return;
            try {
                const position = payload && typeof payload.position === "number" ? payload.position : undefined;
                const { room: updatedRoom, change } = roomService.setPlayback(room.id, socket.id, {
                    status: "paused",
                    position
                });
                broadcast(updatedRoom, change, socket.id);
                appendActivity(updatedRoom, socket, "paused playback");
            } catch (err) {
                emitError(socket, err);
            }
        },

        handleSeek(socket, payload) {
            const room = assertRoom(socket);
            if (!room) return;
            try {
                const position = payload && payload.position;
                const { room: updatedRoom, change } = roomService.setPlayback(room.id, socket.id, {
                    position
                });
                broadcast(updatedRoom, change, socket.id);
                appendActivity(updatedRoom, socket, `seeked to ${change.position}s`);
            } catch (err) {
                emitError(socket, err);
            }
        },

        handleSetTrack(socket, payload) {
            const room = assertRoom(socket);
            if (!room) return;
            try {
                const track = payload && payload.track;
                const { room: updatedRoom, change } = roomService.setPlayback(room.id, socket.id, {
                    track,
                    ...(track ? { position: 0 } : {})
                });
                broadcast(updatedRoom, change, socket.id);
                appendActivity(updatedRoom, socket, change.track ? `set track ${change.track.url}` : "cleared track");
            } catch (err) {
                emitError(socket, err);
            }
        },

        handleQueueAdd(socket, payload) {
            const room = assertRoom(socket);
            if (!room) return;
            try {
                const track = payload && payload.track;
                const { room: updatedRoom, queue } = roomService.addToQueue(room.id, socket.id, track);
                broadcastQueue(updatedRoom, queue);
                appendActivity(updatedRoom, socket, `added to queue: ${track.url}`);
            } catch (err) {
                emitError(socket, err);
            }
        },

        handleQueueRemove(socket, payload) {
            const room = assertRoom(socket);
            if (!room) return;
            try {
                const index = payload && payload.index;
                const { room: updatedRoom, queue } = roomService.removeFromQueue(room.id, socket.id, index);
                broadcastQueue(updatedRoom, queue);
            } catch (err) {
                emitError(socket, err);
            }
        },

        handleQueueClear(socket) {
            const room = assertRoom(socket);
            if (!room) return;
            try {
                const { room: updatedRoom, queue } = roomService.clearQueue(room.id, socket.id);
                broadcastQueue(updatedRoom, queue);
                appendActivity(updatedRoom, socket, "cleared queue");
            } catch (err) {
                emitError(socket, err);
            }
        },

        handleSkip(socket) {
            const room = assertRoom(socket);
            if (!room) return;
            try {
                const { room: updatedRoom, change, queue } = roomService.skipToNext(room.id, socket.id);
                broadcast(updatedRoom, change, socket.id);
                broadcastQueue(updatedRoom, queue);
                appendActivity(updatedRoom, socket, change.track ? `skipped to ${change.track.url}` : "skip (queue empty)");
                refreshTrackBroadcast(updatedRoom, change, socket);
            } catch (err) {
                emitError(socket, err);
            }
        }
    };
}

module.exports = createPlaybackHandler;