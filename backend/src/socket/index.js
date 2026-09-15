const { Server } = require("socket.io");
const MemoryRoomStore = require("../rooms/MemoryRoomStore");
const RoomService = require("../rooms/RoomService");
const { CLIENT, SERVER } = require("./events");
const createRoomHandler = require("./handlers/roomHandler");
const createPlaybackHandler = require("./handlers/playbackHandler");
const createWallpaperHandler = require("./handlers/wallpaperHandler");
const createActivityHandler = require("./handlers/activityHandler");
const createTimerHandler = require("./handlers/timerHandler");
const { createRtcHandler, resolveIceServers } = require("./handlers/rtcHandler");

function createSocketServer(httpServer, roomService = new RoomService(MemoryRoomStore)) {
    const io = new Server(httpServer, {
        cors: {
            origin: process.env.CLIENT_ORIGIN || "http://localhost:3000",
            methods: ["GET", "POST"]
        },
        // Bound packet size at the transport level (default is 1MB; tighten to 256KB)
        maxHttpBufferSize: 256 * 1024
    });

    // Per-socket, per-event-window throttle: prevents event flood amplification
    // into room broadcasts. Relay events (rtc:offer/answer/ice) are 1:1 fan-out,
    // not room broadcasts, so they stay under the general cap only — a WebRTC
    // call setup naturally bursts many ICE candidates in <10s.
    const EVENT_LIMIT = 60;             // max events per window
    const EVENT_WINDOW_MS = 10_000;     // window length
    const SENSITIVE_EVENT_LIMIT = 10;   // stricter cap for room-mutating broadcasts
    const SENSITIVE_EVENTS = new Set([
        CLIENT.ROOM_CREATE,
        CLIENT.ROOM_JOIN,
        CLIENT.PLAYBACK_SET_TRACK,
        CLIENT.WALLPAPER_SET
    ]);

    function makeRateLimiter() {
        const buckets = new Map();
        return function check(socket) {
            const now = Date.now();
            let bucket = buckets.get(socket.id);
            if (!bucket || now - bucket.startedAt > EVENT_WINDOW_MS) {
                bucket = { count: 0, startedAt: now, sensitive: 0 };
                buckets.set(socket.id, bucket);
            }
            const allow = bucket.count < EVENT_LIMIT;
            bucket.count += 1;
            return { allow, bucket };
        };
    }

    const globalRateCheck = makeRateLimiter();

    const roomHandler = createRoomHandler(io, roomService);
    const playbackHandler = createPlaybackHandler(io, roomService);
    const wallpaperHandler = createWallpaperHandler(io, roomService);
    const rtcHandler = createRtcHandler(io, roomService);
    const activityHandler = createActivityHandler(io, roomService);
    const timerHandler = createTimerHandler(io, roomService);

    io.on("connection", (socket) => {
        // Store ICE config on socket — only emit after room join (not on bare connect)
        const iceConfig = { iceServers: resolveIceServers(process.env) };

        function emitIceConfig() {
            if (!socket._iceSent) {
                socket.emit(SERVER.RTC_CONFIG, iceConfig);
                socket._iceSent = true;
            }
        }

        // Rate-limit guard: disconnect sockets that flood events
        function guarded(eventName, handler) {
            return (...args) => {
                const { allow, bucket } = globalRateCheck(socket);
                if (!allow) {
                    socket.emit(SERVER.ROOM_ERROR, { code: "RATE_LIMITED", message: "Too many events — slow down" });
                    socket.disconnect(true);
                    return;
                }
                if (SENSITIVE_EVENTS.has(eventName)) {
                    if (bucket.sensitive >= SENSITIVE_EVENT_LIMIT) {
                        socket.emit(SERVER.ROOM_ERROR, { code: "RATE_LIMITED", message: "Too many sensitive operations" });
                        socket.disconnect(true);
                        return;
                    }
                    bucket.sensitive += 1;
                }
                handler(...args);
            };
        }

        socket.on(CLIENT.ROOM_CREATE, guarded(CLIENT.ROOM_CREATE, (payload) => {
            roomHandler.handleCreate(socket, payload, emitIceConfig);
        }));
        socket.on(CLIENT.ROOM_JOIN, guarded(CLIENT.ROOM_JOIN, (payload) => {
            roomHandler.handleJoin(socket, payload, emitIceConfig);
        }));
        socket.on(CLIENT.ROOM_LEAVE, guarded(CLIENT.ROOM_LEAVE, () => roomHandler.handleLeave(socket)));
        socket.on(CLIENT.ROOM_GET_STATE, guarded(CLIENT.ROOM_GET_STATE, () => roomHandler.handleGetState(socket)));
        socket.on(CLIENT.ROOM_CHECK, guarded(CLIENT.ROOM_CHECK, (payload) => roomHandler.handleCheck(socket, payload)));
        socket.on(CLIENT.ROOM_SET_TITLE, guarded(CLIENT.ROOM_SET_TITLE, (payload) => roomHandler.handleSetTitle(socket, payload)));
        socket.on(CLIENT.PLAYBACK_PLAY, guarded(CLIENT.PLAYBACK_PLAY, (payload) => playbackHandler.handlePlay(socket, payload)));
        socket.on(CLIENT.PLAYBACK_PAUSE, guarded(CLIENT.PLAYBACK_PAUSE, (payload) => playbackHandler.handlePause(socket, payload)));
        socket.on(CLIENT.PLAYBACK_SEEK, guarded(CLIENT.PLAYBACK_SEEK, (payload) => playbackHandler.handleSeek(socket, payload)));
        socket.on(CLIENT.PLAYBACK_SET_TRACK, guarded(CLIENT.PLAYBACK_SET_TRACK, (payload) => playbackHandler.handleSetTrack(socket, payload)));
        socket.on(CLIENT.PLAYBACK_QUEUE_ADD, guarded(CLIENT.PLAYBACK_QUEUE_ADD, (payload) => playbackHandler.handleQueueAdd(socket, payload)));
        socket.on(CLIENT.PLAYBACK_QUEUE_REMOVE, guarded(CLIENT.PLAYBACK_QUEUE_REMOVE, (payload) => playbackHandler.handleQueueRemove(socket, payload)));
        socket.on(CLIENT.PLAYBACK_QUEUE_CLEAR, guarded(CLIENT.PLAYBACK_QUEUE_CLEAR, () => playbackHandler.handleQueueClear(socket)));
        socket.on(CLIENT.PLAYBACK_SKIP, guarded(CLIENT.PLAYBACK_SKIP, () => playbackHandler.handleSkip(socket)));
        socket.on(CLIENT.WALLPAPER_SET, guarded(CLIENT.WALLPAPER_SET, (payload) => wallpaperHandler.handleSetWallpaper(socket, payload)));
        socket.on(CLIENT.RTC_MEDIA, guarded(CLIENT.RTC_MEDIA, (payload) => rtcHandler.handleMedia(socket, payload)));
        socket.on(CLIENT.RTC_OFFER, guarded(CLIENT.RTC_OFFER, (payload) => rtcHandler.handleOffer(socket, payload)));
        socket.on(CLIENT.RTC_ANSWER, guarded(CLIENT.RTC_ANSWER, (payload) => rtcHandler.handleAnswer(socket, payload)));
        socket.on(CLIENT.RTC_ICE, guarded(CLIENT.RTC_ICE, (payload) => rtcHandler.handleIce(socket, payload)));
        socket.on(CLIENT.ACTIVITY_SEND, guarded(CLIENT.ACTIVITY_SEND, (payload) => activityHandler.handleSend(socket, payload)));
        socket.on(CLIENT.TIMER_START, guarded(CLIENT.TIMER_START, (payload) => timerHandler.handleStart(socket, payload)));
        socket.on(CLIENT.TIMER_PAUSE, guarded(CLIENT.TIMER_PAUSE, () => timerHandler.handlePause(socket)));
        socket.on(CLIENT.TIMER_RESUME, guarded(CLIENT.TIMER_RESUME, () => timerHandler.handleResume(socket)));
        socket.on(CLIENT.TIMER_RESET, guarded(CLIENT.TIMER_RESET, () => timerHandler.handleReset(socket)));

        // Cleanup rate-limit bucket on disconnect
        socket.on("disconnect", () => {
            const room = roomService.resolveRoomBySocket(socket.id);
            if (!room) return;
            const member = room.members.get(socket.id);
            const displayName = member ? member.displayName : "unknown";
            const isLastMember = room.members.size === 1;
            if (!isLastMember) {
                // Notify remaining members BEFORE leaveRoom: when the last member
                // leaves, leaveRoom reclaims the room and any later room access
                // throws RoomNotFoundError.
                const { entry } = roomService.appendActivity(room.id, { type: "system", actor: { socketId: socket.id, displayName }, detail: "left" });
                socket.to(room.id).emit(SERVER.ROOM_MEMBER_LEFT, { socketId: socket.id });
                socket.to(room.id).emit(SERVER.ROOM_ACTIVITY, { entry });
            }
            roomService.leaveRoom(room.id, socket.id);
        });
    });

    return { io, roomService };
}

module.exports = { createSocketServer };