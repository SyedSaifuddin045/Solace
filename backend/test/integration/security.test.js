const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { io: ioc } = require("socket.io-client");
const {
    startTestServer,
    connectClient,
    waitForEvent,
    closeSocket,
    closeServer
} = require("../helpers/startServer");

const state = { server: null, sockets: [] };

async function boot() {
    const { server, port, io } = await startTestServer();
    state.server = { server, io };
    return { server, port, io };
}

function track(socket) {
    state.sockets.push(socket);
    return socket;
}

function rawClient(port, extraHeaders = {}) {
    return ioc(`http://localhost:${port}`, {
        transports: ["websocket"],
        extraHeaders,
    });
}

function onceConnect(socket) {
    return new Promise((resolve, reject) => {
        socket.once("connect", resolve);
        socket.once("connect_error", reject);
    });
}

function onceConnectError(socket) {
    return new Promise((resolve) => socket.once("connect_error", resolve));
}

afterEach(async () => {
    for (const s of state.sockets) await closeSocket(s);
    state.sockets = [];
    if (state.server) {
        await closeServer(state.server.server);
        state.server = null;
    }
    delete process.env.SOLACE_MAX_CONNECTIONS;
    delete process.env.SOLACE_MAX_SOCKETS_PER_IP;
    delete process.env.SOLACE_JOIN_LIMIT_PER_IP;
    delete process.env.SOLACE_JOIN_WINDOW_MS;
});

test("socket connect past per-IP cap gets connect_error RATE_LIMITED", async () => {
    process.env.SOLACE_MAX_SOCKETS_PER_IP = "3";
    const { port } = await boot();
    track(await connectClient(port));
    track(await connectClient(port));
    track(await connectClient(port));
    const rejected = rawClient(port);
    const err = await onceConnectError(rejected);
    assert.match(err.message, /RATE_LIMITED/);
    rejected.close();
});

test("distinct X-Forwarded-For values get separate per-IP budgets", async () => {
    process.env.SOLACE_MAX_SOCKETS_PER_IP = "1";
    const { port } = await boot();
    const a = track(rawClient(port, { "X-Forwarded-For": "1.1.1.1" }));
    const b = track(rawClient(port, { "X-Forwarded-For": "2.2.2.2" }));
    await Promise.all([onceConnect(a), onceConnect(b)]);
    const c = rawClient(port, { "X-Forwarded-For": "1.1.1.1" });
    const err = await onceConnectError(c);
    assert.match(err.message, /RATE_LIMITED/);
    c.close();
});

test("total connection cap rejects past SOLACE_MAX_CONNECTIONS", async () => {
    process.env.SOLACE_MAX_CONNECTIONS = "2";
    process.env.SOLACE_MAX_SOCKETS_PER_IP = "100";
    const { port } = await boot();
    track(await connectClient(port));
    track(await connectClient(port));
    const rejected = rawClient(port, { "X-Forwarded-For": "9.9.9.9" });
    const err = await onceConnectError(rejected);
    assert.match(err.message, /RATE_LIMITED/);
    rejected.close();
});

test("room:create flood past per-IP window returns RATE_LIMITED, socket stays alive", async () => {
    process.env.SOLACE_JOIN_LIMIT_PER_IP = "3";
    process.env.SOLACE_JOIN_WINDOW_MS = "60000";
    const { port } = await boot();
    const client = track(await connectClient(port));
    const errors = [];
    for (let i = 0; i < 5; i++) {
        const ep = waitForEvent(client, "room:error", (p) => p.code === "RATE_LIMITED" || p.code === "REACHED_MAX_ROOMS");
        client.emit("room:create", { displayName: "Flood" + i });
        try { errors.push(await ep); } catch { /* flush window */ }
    }
    const limited = errors.filter((e) => e.code === "RATE_LIMITED");
    assert.ok(limited.length >= 1, `expected RATE_LIMITED, got ${errors.map((e) => e.code).join(",") || "none"}`);
    assert.equal(client.connected, true);
});