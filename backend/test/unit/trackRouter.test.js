const test = require("node:test");
const assert = require("node:assert/strict");
const { PassThrough } = require("node:stream");
const { followRedirectsGet, streamProxyResponse } = require("../../src/track/trackRouter");
const PROXY_CAP_BYTES = 100 * 1024 * 1024; // mirrors PROXY_MAX_BYTES in trackRouter.js

// In-memory transport double: records calls, hands back scripted responses.
// Each scripted entry may also schedule a req-level event (timeout / error).
function fakeTransport(script) {
    const calls = [];
    const reqs = [];
    let i = 0;
    const get = (url, opts, cb) => {
        const entry = script[i++ % script.length];
        calls.push({ url, opts });
        const res = new PassThrough();
        const handlers = {};
        process.nextTick(() => {
            if (entry.reqEvent === "timeout") {
                if (handlers.timeout) handlers.timeout();
                return;
            }
            if (entry.reqEvent === "error") {
                if (handlers.error) handlers.error(new Error("socket hang up"));
                return;
            }
            res.statusCode = entry.status;
            res.headers = entry.headers || {};
            if (entry.body) res.write(entry.body);
            cb(res);
        });
        const req = {
            destroyed: false,
            on(ev, fn) { handlers[ev] = fn; return this; },
            destroy() { this.destroyed = true; },
        };
        reqs.push(req);
        return req;
    };
    return { http: { get }, https: { get }, calls, reqs };
}

// Runs followRedirectsGet and resolves with { final, error, transport } once
// the terminal onFinal/onError fires.
function run(url, opts, maxRedirects, transport) {
    return new Promise((resolve) => {
        followRedirectsGet(url, opts, (final) => resolve({ final, error: null }), (error) => resolve({ final: null, error }), maxRedirects, transport);
    });
}

test("followRedirectsGet follows a single 302 to the final audio stream", async () => {
    const t = fakeTransport([
        { status: 302, headers: { location: "https://rr1---sn-x.googlevideo.com/videoplayback?hop=2" } },
        { status: 200, headers: { "content-type": "audio/mp4" }, body: Buffer.from("AUDIO") },
    ]);
    const { final, error } = await run("https://rr4---sn-x.googlevideo.com/videoplayback?hop=1", {}, 5, t);
    assert.equal(error, null);
    assert.equal(final.statusCode, 200);
    assert.equal(t.calls.length, 2);
    assert.match(t.calls[1].url, /hop=2/);
});

test("followRedirectsGet follows a RELATIVE redirect location", async () => {
    const t = fakeTransport([
        { status: 302, headers: { location: "/videoplayback?hop=2" } },
        { status: 200, headers: { "content-type": "audio/mp4" }, body: Buffer.from("AUDIO") },
    ]);
    const { final, error } = await run("https://rr4---sn-x.googlevideo.com/videoplayback?hop=1", {}, 5, t);
    assert.equal(error, null);
    assert.equal(final.statusCode, 200);
    assert.equal(t.calls.length, 2);
    assert.match(t.calls[1].url, /rr4---sn-x\.googlevideo\.com\/videoplayback\?hop=2/);
});

test("followRedirectsGet caps hops and reports error", async () => {
    const t = fakeTransport([
        { status: 302, headers: { location: "https://rr1---sn-x.googlevideo.com/videoplayback?hop=2" } },
    ]);
    const { final, error } = await run("https://rr4---sn-x.googlevideo.com/videoplayback?hop=1", {}, 1, t);
    assert.equal(final, null);
    assert.ok(error);
    assert.equal(t.calls.length, 2); // initial + one redirect = cap reached
});

test("followRedirectsGet passes Range header and adds default UA", async () => {
    const t = fakeTransport([
        { status: 200, headers: { "content-type": "audio/mp4" }, body: Buffer.from("X") },
    ]);
    await run("https://rr4---sn-x.googlevideo.com/videoplayback", { headers: { Range: "bytes=0-15" } }, 5, t);
    assert.equal(t.calls[0].opts.headers.Range, "bytes=0-15");
    assert.match(t.calls[0].opts.headers["User-Agent"], /Solace/i);
});

test("followRedirectsGet rejects non-http(s) protocols (initial)", async () => {
    const t = fakeTransport([]);
    const { final, error } = await run("file:///etc/passwd", {}, 5, t);
    assert.equal(final, null);
    assert.ok(error);
    assert.equal(t.calls.length, 0);
});

test("followRedirectsGet rejects non-http(s) redirect target", async () => {
    const t = fakeTransport([
        { status: 302, headers: { location: "file:///etc/passwd" } },
    ]);
    const { final, error } = await run("https://rr4---sn-x.googlevideo.com/videoplayback", {}, 5, t);
    assert.equal(final, null);
    assert.ok(error);
    assert.match(error.code, /BAD_REDIRECT/);
});

test("followRedirectsGet accepts http: redirect targets via http transport", async () => {
    const t = fakeTransport([
        { status: 302, headers: { location: "http://rr1---sn-x.googlevideo.com/videoplayback?hop=2" } },
        { status: 200, headers: { "content-type": "audio/mp4" }, body: Buffer.from("A") },
    ]);
    const { final, error } = await run("https://rr4---sn-x.googlevideo.com/videoplayback", {}, 5, t);
    assert.equal(error, null);
    assert.equal(final.statusCode, 200);
    assert.equal(t.calls[0].url.startsWith("https://"), true);
    assert.equal(t.calls[1].url.startsWith("http://"), true);
});

test("followRedirectsGet surfaces request timeout as error", async () => {
    const t = fakeTransport([{ reqEvent: "timeout" }]);
    const { final, error } = await run("https://rr4---sn-x.googlevideo.com/videoplayback", { timeout: 100 }, 5, t);
    assert.equal(final, null);
    assert.ok(error);
    assert.equal(error.code, "ETIMEDOUT");
});

test("followRedirectsGet surfaces transport error as error", async () => {
    const t = fakeTransport([{ reqEvent: "error" }]);
    const { final, error } = await run("https://rr4---sn-x.googlevideo.com/videoplayback", {}, 5, t);
    assert.equal(final, null);
    assert.ok(error);
    assert.match(error.message, /socket hang up/);
});

test("followRedirectsGet stops redirect loop at the cap", async () => {
    const t = fakeTransport([
        { status: 302, headers: { location: "https://rr1---sn-x.googlevideo.com/videoplayback?hop=2" } },
    ]);
    const { final, error } = await run("https://rr4---sn-x.googlevideo.com/videoplayback", {}, 3, t);
    assert.equal(final, null);
    assert.ok(error);
    assert.match(error.code, /TOO_MANY_REDIRECTS/);
    assert.equal(t.calls.length, 4); // 1 initial + 3 redirects = cap hit on the 4th hop attempt
});

// ---- streamProxyResponse: forwards upstream audio to the client response ----

function fakeRes() {
    const calls = [];
    return {
        calls,
        headersSent: false,
        writeHead(status, headers) { this.headersSent = true; calls.push(["writeHead", status, headers]); },
        write(chunk) { calls.push(["write", chunk]); },
        end() { calls.push(["end"]); },
        destroy() { calls.push(["destroy"]); },
        status(code) { calls.push(["status", code]); return this; },
        json(body) { calls.push(["json", body]); },
    };
}

test("streamProxyResponse forwards 200 audio with pinned CORS", async () => {
    const up = new PassThrough();
    up.headers = { "content-type": "audio/mp4" };
    const res = fakeRes();
    streamProxyResponse(up, res, "http://localhost:3000");
    up.write(Buffer.from("AUDIO"));
    up.end();
    await new Promise((r) => setImmediate(r));
    assert.equal(res.calls[0][0], "writeHead");
    assert.equal(res.calls[0][1], 200);
    assert.equal(res.calls[0][2]["Content-Type"], "audio/mp4");
    assert.equal(res.calls[0][2]["Access-Control-Allow-Origin"], "http://localhost:3000");
    assert.equal(res.calls.some((c) => c[0] === "write" && c[1].toString() === "AUDIO"), true);
    assert.equal(res.calls.at(-1)[0], "end");
});

test("streamProxyResponse keeps 206 status and forwards content-range", async () => {
    const up = new PassThrough();
    const res = fakeRes();
    up.statusCode = 206;
    up.headers = { "content-type": "audio/mp4", "content-range": "bytes 0-99/3449447", "content-length": "100" };
    streamProxyResponse(up, res, "http://localhost:3000");
    up.end();
    assert.equal(res.calls[0][1], 206);
    assert.equal(res.calls[0][2]["Content-Range"], "bytes 0-99/3449447");
    assert.equal(res.calls[0][2]["Content-Length"], "100");
});

test("streamProxyResponse destroys client when upstream exceeds the cap", async () => {
    const up = new PassThrough();
    up.headers = { "content-type": "audio/mp4" };
    const res = fakeRes();
    streamProxyResponse(up, res, "http://localhost:3000");
    // One chunk over the 100MB internal cap trips the downstream abort.
    const bigChunk = Buffer.alloc(PROXY_CAP_BYTES + 1, 0x61);
    up.write(bigChunk);
    assert.equal(res.calls.some((c) => c[0] === "writeHead" && c[1] === 200), true);
    assert.equal(res.calls.some((c) => c[0] === "destroy"), true);
    assert.equal(res.calls.some((c) => c[0] === "end"), false);
    up.destroy();
});

test("streamProxyResponse destroys client on upstream error after headers", async () => {
    const up = new PassThrough();
    up.headers = { "content-type": "audio/mp4" };
    const res = fakeRes();
    streamProxyResponse(up, res, "http://localhost:3000");
    up.write(Buffer.from("part"));
    up.emit("error", new Error("boom"));
    assert.equal(res.calls.some((c) => c[0] === "destroy"), true);
});