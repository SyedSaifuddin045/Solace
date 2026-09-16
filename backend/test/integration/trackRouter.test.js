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
    return { client, roomId: created.roomId, created };
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

describe("track router security", () => {
    test("proxy without roomId → 400 MISSING_ROOM", async () => {
        const { port } = await boot();
        const res = await fetch(`http://127.0.0.1:${port}/track/proxy?url=https%3A%2F%2Fx.com%2Fa.m4a`);
        assert.equal(res.status, 400);
        assert.equal((await res.json()).error, "MISSING_ROOM");
    });

    test("proxy with malformed roomId → 400 MISSING_ROOM", async () => {
        const { port } = await boot();
        const res = await fetch(`http://127.0.0.1:${port}/track/proxy?url=https%3A%2F%2Fx.com%2Fa.m4a&roomId=../etc&socketId=s1`);
        assert.equal(res.status, 400);
        assert.equal((await res.json()).error, "MISSING_ROOM");
    });

    test("proxy with socketId that is not a room member → 403", async () => {
        const { port } = await boot();
        const res = await fetch(`http://127.0.0.1:${port}/track/proxy?url=https%3A%2F%2Fx.com%2Fa.m4a&roomId=ZZZZZZ&socketId=ghost`);
        assert.equal(res.status, 403);
        assert.equal((await res.json()).error, "FORBIDDEN");
    });

    test("proxy by a member but non-googlevideo URL → 403", async () => {
        const { port } = await boot();
        const { client, roomId } = await createRoom(port, "Host");
        const res = await fetch(`http://127.0.0.1:${port}/track/proxy?url=${encodeURIComponent("https://evil.example/steal.m4a")}&roomId=${roomId}&socketId=${client.id}`);
        assert.equal(res.status, 403);
        assert.equal((await res.json()).error, "FORBIDDEN");
    });

    test("proxy invalid URL → 400", async () => {
        const { port } = await boot();
        const { client, roomId } = await createRoom(port, "Host");
        const res = await fetch(`http://127.0.0.1:${port}/track/proxy?url=${encodeURIComponent("not a url")}&roomId=${roomId}&socketId=${client.id}`);
        assert.equal(res.status, 400);
        assert.equal((await res.json()).error, "INVALID_URL");
    });

    test("resolve with oversized URL → 400 URL_TOO_LONG", async () => {
        const { port } = await boot();
        const res = await fetch(`http://127.0.0.1:${port}/track/resolve`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ url: "https://youtube.com/watch?v=" + "a".repeat(3000) })
        });
        assert.equal(res.status, 400);
        assert.equal((await res.json()).error, "URL_TOO_LONG");
    });

    test("resolve without url → 400 MISSING_URL", async () => {
        const { port } = await boot();
        const res = await fetch(`http://127.0.0.1:${port}/track/resolve`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({})
        });
        assert.equal(res.status, 400);
        assert.equal((await res.json()).error, "MISSING_URL");
    });

    test("resolve soundcloud → 422 (no playable stream ever — must not pretend)", async () => {
        const { port } = await boot();
        const res = await fetch(`http://127.0.0.1:${port}/track/resolve`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ url: "https://soundcloud.com/artist/track-name" })
        });
        assert.equal(res.status, 422);
        const body = await res.json();
        assert.equal(body.error, "RESOLVE_FAILED");
        assert.match(body.message, /SoundCloud/);
        assert.equal(body.playable, false);
        assert.equal(body.embeddable, false);
    });

    test("resolve unknown provider → 422 (would be dead audio otherwise)", async () => {
        const { port } = await boot();
        const res = await fetch(`http://127.0.0.1:${port}/track/resolve`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ url: "https://example.com/song.mp3" })
        });
        assert.equal(res.status, 422);
        const body = await res.json();
        assert.equal(body.error, "RESOLVE_FAILED");
        assert.match(body.message, /YouTube/);
    });

    test("options preflight to proxy pins allowed origin", async () => {
        const { port } = await boot();
        const res = await fetch(`http://127.0.0.1:${port}/track/proxy`, {
            method: "OPTIONS",
            headers: {
                origin: "http://localhost:3000",
                "access-control-request-method": "GET",
                "access-control-request-headers": "Range"
            }
        });
        assert.equal(res.status, 204);
        assert.equal(res.headers.get("access-control-allow-origin"), "http://localhost:3000");
    });

    test("proxy response for non-allowed origin omits ACAO", async () => {
        const { port } = await boot();
        const res = await fetch(`http://127.0.0.1:${port}/track/proxy`, {
            method: "OPTIONS",
            headers: { origin: "https://evil.example" }
        });
        assert.equal(res.status, 204);
        assert.equal(res.headers.get("access-control-allow-origin"), null);
    });
});