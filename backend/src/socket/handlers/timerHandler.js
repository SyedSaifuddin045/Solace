const { SERVER } = require("../events");

function createTimerHandler(io, roomService) {
    function emitError(socket, err) {
        socket.emit(SERVER.ROOM_ERROR, { code: err.code, message: err.message });
    }

    function requireRoom(socket) {
        const room = roomService.resolveRoomBySocket(socket.id);
        if (!room) {
            emitError(socket, Object.assign(new Error("Not a member of this room"), { code: "NOT_IN_ROOM" }));
            return null;
        }
        return room;
    }

    function logTimer(room, actor, detail) {
        const { entry } = roomService.appendActivity(room.id, { type: "timer", actor, detail });
        io.to(room.id).emit(SERVER.ROOM_ACTIVITY, { entry });
    }

    return {
        handleStart(socket, payload) {
            const room = requireRoom(socket);
            if (!room) return;
            try {
                const minutes = payload && payload.minutes;
                const member = room.members.get(socket.id);
                const actor = { socketId: socket.id, displayName: member ? member.displayName : "unknown" };
                console.log("[solace:BE] timer:start received", {
                    from: socket.id,
                    roomId: room.id,
                    minutes,
                    previousStatus: room.state.timer.status
                });
                const { room: updatedRoom, timer } = roomService.startTimer(room.id, socket.id, minutes, (completion) => {
                    console.log("[solace:BE] timer:complete fired", {
                        roomId: updatedRoom.id,
                        completedBy: actor.socketId,
                        durationMs: completion.timer.durationMs
                    });
                    io.to(updatedRoom.id).emit(SERVER.TIMER_COMPLETE, {
                        completedBy: actor.socketId,
                        durationMs: completion.timer.durationMs
                    });
                    io.to(updatedRoom.id).emit(SERVER.TIMER_STATE, completion.timer);
                    logTimer(updatedRoom, actor, "timer finished");
                });
                console.log("[solace:BE] timer:start result", {
                    from: socket.id,
                    roomId: updatedRoom.id,
                    status: timer.status,
                    durationMs: timer.durationMs,
                    remainingMs: timer.remainingMs,
                    endsAt: timer.endsAt
                });
                io.to(updatedRoom.id).emit(SERVER.TIMER_STATE, timer);
                logTimer(updatedRoom, actor, `started ${minutes}min timer`);
            } catch (err) {
                emitError(socket, err);
            }
        },
        handlePause(socket) {
            const room = requireRoom(socket);
            if (!room) return;
            try {
                const member = room.members.get(socket.id);
                const actor = { socketId: socket.id, displayName: member ? member.displayName : "unknown" };
                console.log("[solace:BE] timer:pause received", { from: socket.id, roomId: room.id, statusBefore: room.state.timer.status });
                const { room: updatedRoom, timer } = roomService.pauseTimer(room.id, socket.id);
                console.log("[solace:BE] timer:pause result", {
                    from: socket.id,
                    roomId: updatedRoom.id,
                    status: timer.status,
                    remainingMs: timer.remainingMs
                });
                io.to(updatedRoom.id).emit(SERVER.TIMER_STATE, timer);
                logTimer(updatedRoom, actor, "paused timer");
            } catch (err) {
                emitError(socket, err);
            }
        },
        handleResume(socket) {
            const room = requireRoom(socket);
            if (!room) return;
            if (room.state.timer.status !== "paused") return;
            try {
                const member = room.members.get(socket.id);
                const actor = { socketId: socket.id, displayName: member ? member.displayName : "unknown" };
                console.log("[solace:BE] timer:resume received", { from: socket.id, roomId: room.id, remainingMs: room.state.timer.remainingMs });
                const { room: updatedRoom, timer } = roomService.resumeTimer(room.id, socket.id, (completion) => {
                    console.log("[solace:BE] timer:complete fired", {
                        roomId: updatedRoom.id,
                        completedBy: actor.socketId,
                        durationMs: completion.timer.durationMs
                    });
                    io.to(updatedRoom.id).emit(SERVER.TIMER_COMPLETE, {
                        completedBy: actor.socketId,
                        durationMs: completion.timer.durationMs
                    });
                    io.to(updatedRoom.id).emit(SERVER.TIMER_STATE, completion.timer);
                    logTimer(updatedRoom, actor, "timer finished");
                });
                console.log("[solace:BE] timer:resume result", {
                    from: socket.id,
                    roomId: updatedRoom.id,
                    status: timer.status,
                    remainingMs: timer.remainingMs
                });
                io.to(updatedRoom.id).emit(SERVER.TIMER_STATE, timer);
                logTimer(updatedRoom, actor, "resumed timer");
            } catch (err) {
                emitError(socket, err);
            }
        },
        handleReset(socket) {
            const room = requireRoom(socket);
            if (!room) return;
            try {
                const member = room.members.get(socket.id);
                const actor = { socketId: socket.id, displayName: member ? member.displayName : "unknown" };
                console.log("[solace:BE] timer:reset received", { from: socket.id, roomId: room.id, statusBefore: room.state.timer.status });
                const { room: updatedRoom, timer } = roomService.resetTimer(room.id, socket.id);
                console.log("[solace:BE] timer:reset result", {
                    from: socket.id,
                    roomId: updatedRoom.id,
                    status: timer.status,
                    remainingMs: timer.remainingMs
                });
                io.to(updatedRoom.id).emit(SERVER.TIMER_STATE, timer);
                logTimer(updatedRoom, actor, "reset timer");
            } catch (err) {
                emitError(socket, err);
            }
        }
    };
}

module.exports = createTimerHandler;
