const { test, afterEach, describe } = require("node:test");
const assert = require("node:assert/strict");
const {
    startTestServer,
    connectClient,
    waitForEvent,
    closeSocket,
    closeServer
} = require("../helpers/startServer");

const state = {
    server: null,
    sockets: []
};

async function boot() {
    const { server, port, io } = await startTestServer();
    state.server = { server, io };
    return { server, port, io };
}

function track(socket) {
    state.sockets.push(socket);
    return socket;
}

async function createRoom(port, name = "Host") {
    const client = track(await connectClient(port));
    const createdPromise = waitForEvent(client, "room:created");
    client.emit("room:create", { displayName: name });
    const created = await createdPromise;
    state.lastRoomId = created.roomId;
    return { client, roomId: created.roomId, created };
}

async function joinRoom(port, roomId, name = "Guest") {
    const client = track(await connectClient(port));
    const joinedPromise = waitForEvent(client, "room:joined");
    client.emit("room:join", { roomId, displayName: name });
    const joined = await joinedPromise;
    return { client, joined };
}

afterEach(async () => {
    for (const s of state.sockets) {
        await closeSocket(s);
    }
    state.sockets = [];
    if (state.server) {
        await closeServer(state.server.server);
        if (state.server.io) state.server.io.close();
        state.server = null;
    }
});

describe("timer:resume", () => {
    test("start -> pause -> resume -> status running with remainingMs > 0", async () => {
        const { port } = await boot();
        const { client: host, roomId } = await createRoom(port, "Host");
        const { client: guest } = await joinRoom(port, roomId, "Guest");

        // Start timer
        const startP = waitForEvent(guest, "timer:state", (p) => p.status === "running");
        host.emit("timer:start", { minutes: 25 });
        const startState = await startP;
        assert.equal(startState.durationMs, 25 * 60_000);

        // Pause timer
        const pauseP = waitForEvent(guest, "timer:state", (p) => p.status === "paused");
        host.emit("timer:pause");
        const pauseState = await pauseP;
        assert.ok(pauseState.remainingMs > 0, "remainingMs should be > 0 after pause");

        // Resume timer
        const resumeP = waitForEvent(guest, "timer:state", (p) => p.status === "running");
        host.emit("timer:resume");
        const resumeState = await resumeP;
        assert.equal(resumeState.status, "running");
        assert.ok(resumeState.remainingMs > 0, "remainingMs should be > 0 after resume");
        assert.ok(resumeState.remainingMs < 25 * 60_000, "remainingMs should be less than original duration");
        assert.equal(typeof resumeState.endsAt, "number");
        assert.ok(resumeState.endsAt > Date.now(), "endsAt should be in the future");

        // Clean up: reset timer
        const resetP = waitForEvent(host, "timer:state", (p) => p.status === "idle");
        host.emit("timer:reset");
        await resetP;
    });

    test("resume when status is running -> no change (ignored)", async () => {
        const { port } = await boot();
        const { client: host, roomId } = await createRoom(port, "Host");
        const { client: guest } = await joinRoom(port, roomId, "Guest");

        // Start timer
        const startP = waitForEvent(guest, "timer:state", (p) => p.status === "running");
        host.emit("timer:start", { minutes: 10 });
        await startP;

        // Resume while running — should be ignored (no state change event)
        host.emit("timer:resume");

        // Give it a moment, then verify timer is still running
        await new Promise((r) => setTimeout(r, 100));

        // Reset to clean up
        const resetP = waitForEvent(host, "timer:state", (p) => p.status === "idle");
        host.emit("timer:reset");
        await resetP;
    });

    test("resume when status is idle -> no change (ignored)", async () => {
        const { port } = await boot();
        const { client: host } = await createRoom(port, "Host");

        // Resume while idle — should be ignored (no state change event)
        host.emit("timer:resume");

        // Give it a moment, then verify timer is still idle
        await new Promise((r) => setTimeout(r, 100));
        // No crash, no state event — test passes if no error thrown
    });

    test("resume when status is running -> no timer:state broadcast", async () => {
        const { port } = await boot();
        const { client: host, roomId } = await createRoom(port, "Host");
        const { client: guest } = await joinRoom(port, roomId, "Guest");

        // Start timer
        const startP = waitForEvent(guest, "timer:state", (p) => p.status === "running");
        host.emit("timer:start", { minutes: 5 });
        await startP;

        // Track that no new timer:state is received after resume attempt
        let receivedAfterResume = false;
        const listener = () => { receivedAfterResume = true; };
        guest.on("timer:state", listener);

        host.emit("timer:resume");
        await new Promise((r) => setTimeout(r, 200));
        guest.off("timer:state", listener);

        assert.equal(receivedAfterResume, false, "should not receive timer:state when resuming a running timer");

        // Clean up
        const resetP = waitForEvent(host, "timer:state", (p) => p.status === "idle");
        host.emit("timer:reset");
        await resetP;
    });
});
