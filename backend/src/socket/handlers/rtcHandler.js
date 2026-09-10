const { SERVER, CLIENT } = require("../events");
const { TargetNotInRoomError, NotInRoomError, InvalidPayloadError } = require("../../rooms/RoomService");

const DEFAULT_STUN_URL = "stun:stun.l.google.com:19302";

function resolveIceServers(env) {
    const iceServers = [{ urls: [DEFAULT_STUN_URL] }];
    const { TURN_HOST, TURN_PORT, TURN_USER, TURN_PASSWORD } = env;
    if (TURN_HOST && TURN_USER && TURN_PASSWORD) {
        const port = TURN_PORT || "3478";
        iceServers.push({
            urls: [
                `turn:${TURN_HOST}:${port}?transport=udp`,
                `turn:${TURN_HOST}:${port}?transport=tcp`
            ],
            username: TURN_USER,
            credential: TURN_PASSWORD
        });
    }
    return iceServers;
}

function createRtcHandler(io, roomService) {
    function emitError(socket, err) {
        socket.emit(SERVER.ROOM_ERROR, { code: err.code, message: err.message });
    }

    function relay(eventName, socket, payload, field) {
        console.log("[solace:BE] rtc relay received", {
            from: socket.id,
            event: eventName,
            payloadKeys: Object.keys(payload || {})
        });
        const fromRoom = roomService.resolveRoomBySocket(socket.id);
        if (!fromRoom) {
            emitError(socket, new NotInRoomError());
            return;
        }
        const to = payload && payload.to;
        const data = payload && payload[field];
        const validData = typeof data === "string"
            ? data.length > 0
            : (data != null && typeof data === "object");
        if (typeof to !== "string" || !validData) {
            emitError(socket, new InvalidPayloadError(`${eventName} requires { to: string, ${field}: string | object }`));
            return;
        }
        if (!fromRoom.members.has(to)) {
            emitError(socket, new TargetNotInRoomError());
            return;
        }
        const envelope = { from: socket.id, [field]: data };
        console.log("[solace:BE] rtc relay emit", { event: eventName, from: socket.id, to, roomId: fromRoom.id });
        io.to(to).emit(eventName, envelope);
    }

    return {
        handleMedia(socket, payload) {
            try {
                const room = roomService.resolveRoomBySocket(socket.id);
                if (!room) {
                    emitError(socket, new NotInRoomError());
                    return;
                }
                const audio = payload && payload.audio;
                const video = payload && payload.video;
                console.log("[solace:BE] rtc:media received", { from: socket.id, roomId: room.id, payload: { audio, video } });
                const member = roomService.setMedia(room.id, socket.id, { audio, video });
                console.log("[solace:BE] rtc:media applied flags", { from: socket.id, roomId: room.id, audioOn: member.audioOn, videoOn: member.videoOn });
                io.to(room.id).emit(SERVER.RTC_MEDIA_STATE, {
                    socketId: socket.id,
                    audio: member.audioOn,
                    video: member.videoOn
                });
                const memberRec = room.members.get(socket.id);
                const actor = { socketId: socket.id, displayName: memberRec ? memberRec.displayName : "unknown" };
                const detail = member.audioOn && member.videoOn ? "camera+mic on" : (member.videoOn ? "camera on" : (member.audioOn ? "mic on" : "camera+mic off"));
                const { entry } = roomService.appendActivity(room.id, { type: "media", actor, detail });
                io.to(room.id).emit(SERVER.ROOM_ACTIVITY, { entry });
            } catch (err) {
                emitError(socket, err);
            }
        },
        handleOffer(socket, payload) { relay(SERVER.RTC_OFFER, socket, payload, "sdp"); },
        handleAnswer(socket, payload) { relay(SERVER.RTC_ANSWER, socket, payload, "sdp"); },
        handleIce(socket, payload) { relay(SERVER.RTC_ICE, socket, payload, "candidate"); }
    };
}

module.exports = { createRtcHandler, resolveIceServers };
