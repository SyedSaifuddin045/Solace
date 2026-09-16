const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { normalizeProxy, parseStaticPool, refreshProxyPool, getProxyPool, _test } = require("../../src/track/proxyPool");

function fakeHttpGet(responseBody) {
    return () => Promise.resolve(responseBody);
}

describe("normalizeProxy", () => {
    it("normalizes webshare dashboard format host:port:user:pass", () => {
        assert.equal(normalizeProxy("45.38.107.97:6014:wuoscekm:irxip6u6yr5v"), "http://wuoscekm:irxip6u6yr5v@45.38.107.97:6014");
    });

    it("passes through standard proxy URLs", () => {
        assert.equal(normalizeProxy("http://u:p@h:80"), "http://u:p@h:80");
        assert.equal(normalizeProxy("socks5://u:p@h:1080"), "socks5://u:p@h:1080");
    });
});

describe("parseStaticPool", () => {
    it("parses comma-separated webshare-style entries", () => {
        const pool = parseStaticPool("h1:1:u:p, http://u:p@h2:80, socks5://u:p@h3:1080");
        assert.equal(pool.length, 3);
        assert.deepEqual(pool[0], "http://u:p@h1:1");
        assert.equal(pool[1], "http://u:p@h2:80");
        assert.equal(pool[2], "socks5://u:p@h3:1080");
    });

    it("returns empty for empty input", () => {
        assert.deepEqual(parseStaticPool(""), []);
    });
});

describe("refreshProxyPool (webshare API)", () => {
    it("fetches valid proxies and populates the runtime pool", async () => {
        const body = {
            count: 2,
            results: [
                { username: "u1", password: "p1", proxy_address: "1.2.3.4", port: 80, valid: true },
                { username: "u2", password: "p2", proxy_address: "5.6.7.8", port: 443, valid: false },
                { username: "u3", password: "p3", proxy_address: "9.9.9.9", port: 1080, valid: true },
            ],
        };
        const calls = [];
        await refreshProxyPool({
            apiKey: "test-key",
            force: true,
            httpGet: (url, headers) => { calls.push({ url, headers }); return Promise.resolve(body); },
        });
        const pool = getProxyPool();
        assert.deepEqual(pool, [
            "http://u1:p1@1.2.3.4:80",
            "http://u3:p3@9.9.9.9:1080",
        ]);
    });

    it("calls the documented Webshare endpoint with Token auth", async () => {
        const calls = [];
        await refreshProxyPool({
            apiKey: "sekrit",
            force: true,
            httpGet: (url, headers) => { calls.push({ url, headers }); return Promise.resolve({ results: [] }); },
        });
        assert.equal(calls.length, 1);
        assert.equal(calls[0].url, "https://proxy.webshare.io/api/v2/proxy/list/?mode=direct&page_size=100");
        assert.equal(calls[0].headers.Authorization, "Token sekrit");
    });

    it("keeps existing pool when API fails", async () => {
        await refreshProxyPool({ apiKey: "test-key", force: true, httpGet: () => Promise.reject(new Error("boom")) });
        const pool = getProxyPool();
        assert.ok(pool.length >= 2, "previous pool should survive API failure");
    });

    it("builds pool from API even when static env list is absent", async () => {
        const body = { results: [{ username: "a", password: "b", proxy_address: "1.1.1.1", port: 1111, valid: true }] };
        await refreshProxyPool({ apiKey: "test-key", force: true, httpGet: fakeHttpGet(body) });
        assert.deepEqual(getProxyPool(), ["http://a:b@1.1.1.1:1111"]);
    });

    it("skips API call when no api key configured", async () => {
        await refreshProxyPool({ apiKey: "", force: true, httpGet: () => Promise.reject(new Error("must not be called")) });
        assert.deepEqual(getProxyPool(), []);
    });
});