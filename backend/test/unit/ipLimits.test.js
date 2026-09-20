const { test } = require("node:test");
const assert = require("node:assert/strict");
const { clientIp, createConnectionGuard, createIpWindowLimiter } = require("../../src/socket/ipLimits");

function fakeSocket({ headers = {}, address = "10.0.0.1", disconnectCb } = {}) {
    const handlers = {};
    const socket = {
        handshake: { headers, address },
        on(event, cb) { handlers[event] = cb; return this; },
        emitDisconnect() { if (handlers.disconnect) handlers.disconnect(); },
        _handlers: handlers,
    };
    return socket;
}

test("clientIp: first XFF value wins", () => {
    const ip = clientIp(fakeSocket({ headers: { "x-forwarded-for": "203.0.113.9, 70.41.3.18" } }));
    assert.equal(ip, "203.0.113.9");
});

test("clientIp: falls back to raw address when no XFF", () => {
    assert.equal(clientIp(fakeSocket()), "10.0.0.1");
});

test("clientIp: empty XFF falls back to raw address", () => {
    const ip = clientIp(fakeSocket({ headers: { "x-forwarded-for": "   " } }));
    assert.equal(ip, "10.0.0.1");
});

test("connection guard: per-IP cap rejects second from same IP, allows other IP", () => {
    const guard = createConnectionGuard({ maxConnections: 100, maxPerIp: 1 });
    const a = fakeSocket();
    guard(a, () => {});
    const a2 = fakeSocket();
    guard(a2, (err) => assert.equal(err.data.code, "RATE_LIMITED"));
    const b = fakeSocket({ address: "10.0.0.2" });
    guard(b, (err) => assert.ok(!err, "distinct IP should connect"));
});

test("connection guard: slot frees on disconnect", () => {
    const guard = createConnectionGuard({ maxConnections: 100, maxPerIp: 1 });
    const a = fakeSocket({ address: "10.0.0.1" });
    const nextCalls = [];
    guard(a, (err) => nextCalls.push(err));
    a.emitDisconnect();
    const a2 = fakeSocket({ address: "10.0.0.1" });
    guard(a2, (err) => nextCalls.push(err));
    assert.deepEqual(nextCalls, [undefined, undefined]); // both admitted after slot freed
});

test("connection guard: global cap rejects past maxConnections", () => {
    const guard = createConnectionGuard({ maxConnections: 1, maxPerIp: 100 });
    guard(fakeSocket(), (err) => assert.ok(!err));
    guard(fakeSocket({ address: "10.0.0.2" }), (err) => assert.equal(err.data.code, "RATE_LIMITED"));
});

test("window limiter: allows limit then rejects, resets after window", async () => {
    const check = createIpWindowLimiter({ limit: 2, windowMs: 40 });
    const a = fakeSocket();
    assert.equal(check(a).allow, true);
    assert.equal(check(a).allow, true);
    assert.equal(check(a).allow, false);
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(check(a).allow, true); // window expired, fresh budget
});

test("window limiter: sweep at capacity deletes expired buckets, map stays bounded", () => {
    const check = createIpWindowLimiter({ limit: 2, windowMs: 60000 });
    const marker = fakeSocket({ address: "10.0.0.0" });
    check(marker);
    check(marker); // marker at limit
    for (let i = 1; i < 10000; i++) {
        assert.equal(check(fakeSocket({ address: `10.0.0.${i}` })).allow, true);
    }
    const realNow = Date.now;
    Date.now = () => realNow() + 60001; // expire every bucket
    try {
        const probe = fakeSocket({ address: "10.0.0.20000" });
        assert.equal(check(probe).allow, true); // sweep runs, frees the map
        assert.equal(check(marker).allow, true); // marker expired, fresh budget
    } finally {
        Date.now = realNow;
    }
});

test("window limiter: sweep at capacity evicts oldest when nothing expired", () => {
    const check = createIpWindowLimiter({ limit: 2, windowMs: 60000 });
    const oldest = fakeSocket({ address: "10.0.0.0" });
    check(oldest);
    check(oldest); // oldest at limit
    for (let i = 1; i < 10000; i++) {
        assert.equal(check(fakeSocket({ address: `10.0.0.${i}` })).allow, true);
    }
    const probe = fakeSocket({ address: "10.0.0.20000" });
    assert.equal(check(probe).allow, true); // at capacity -> evict oldest, add probe
    assert.equal(check(oldest).allow, true); // oldest evicted, fresh budget
    assert.equal(check(oldest).allow, true);
    assert.equal(check(oldest).allow, false); // re-inserted bucket counts again
});