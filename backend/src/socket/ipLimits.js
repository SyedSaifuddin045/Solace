// Per-IP rate limiting for socket connections and sensitive events.
// Production sits behind Traefik which appends X-Forwarded-For; the Express
// layer already sets trust proxy 1. We take the FIRST XFF value (the client)
// and fall back to the raw TCP peer address (local dev / direct connections).

function clientIp(socket) {
    const fwd = socket.handshake && socket.handshake.headers && socket.handshake.headers["x-forwarded-for"];
    if (typeof fwd === "string") {
        const first = fwd.split(",")[0].trim();
        if (first) return first;
    }
    return (socket.handshake && socket.handshake.address) || "unknown";
}

const DEFAULT_MAX_CONNECTIONS = 2000;
const DEFAULT_MAX_SOCKETS_PER_IP = 20;

// Env values are externally controlled; negative or garbage input must fall
// back to sane defaults rather than producing an unbounded/empty limit.
function readPositiveInt(envName, fallback, optsValue) {
    if (typeof optsValue === "number" && Number.isFinite(optsValue) && optsValue > 0) return optsValue;
    const n = parseInt(process.env[envName], 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
}

// io.use middleware: reject connections past the global or per-IP ceiling.
// Rejected sockets receive connect_error with message RATE_LIMITED. Counts
// decrement on disconnect so the pool self-heals.
function createConnectionGuard(opts = {}) {
    const maxConnections = readPositiveInt("SOLACE_MAX_CONNECTIONS", DEFAULT_MAX_CONNECTIONS, opts.maxConnections);
    const maxPerIp = readPositiveInt("SOLACE_MAX_SOCKETS_PER_IP", DEFAULT_MAX_SOCKETS_PER_IP, opts.maxPerIp);
    let total = 0;
    const byIp = new Map(); // ip -> count

    return function connectionGuard(socket, next) {
        const ip = clientIp(socket);
        const curIp = byIp.get(ip) || 0;
        if (total >= maxConnections || curIp >= maxPerIp) {
            const err = new Error("RATE_LIMITED");
            err.data = { code: "RATE_LIMITED", message: "Too many connections" };
            return next(err);
        }
        total += 1;
        byIp.set(ip, curIp + 1);
        socket.on("disconnect", () => {
            total -= 1;
            const c = byIp.get(ip);
            if (c && c > 1) byIp.set(ip, c - 1);
            else byIp.delete(ip);
        });
        next();
    };
}

const DEFAULT_JOIN_LIMIT_PER_IP = 30;
const DEFAULT_JOIN_WINDOW_MS = 10 * 60 * 1000;
const MAX_BUCKETS = 10_000;

// Per-IP sliding-window limiter for sensitive room events (create/join).
// Returns { allow, ip }. Reject-only: the socket stays connected.
function createIpWindowLimiter(opts = {}) {
    const limit = readPositiveInt("SOLACE_JOIN_LIMIT_PER_IP", DEFAULT_JOIN_LIMIT_PER_IP, opts.limit);
    const windowMs = readPositiveInt("SOLACE_JOIN_WINDOW_MS", DEFAULT_JOIN_WINDOW_MS, opts.windowMs);
    const buckets = new Map(); // ip -> { count, startedAt }

    // Bounded sweep: only when the map is at capacity. Delete buckets past the
    // window; if none are expired, evict the oldest buckets to keep the map
    // from growing forever under an IP-rotation flood. Worst case scan is
    // bounded by MAX_BUCKETS and only runs at capacity.
    function prune(now) {
        if (buckets.size < MAX_BUCKETS) return;
        let oldestIp = null;
        let oldestAt = Infinity;
        for (const [ip, b] of buckets) {
            if (now - b.startedAt > windowMs) {
                buckets.delete(ip);
                continue;
            }
            if (b.startedAt < oldestAt) {
                oldestAt = b.startedAt;
                oldestIp = ip;
            }
        }
        if (oldestIp !== null) buckets.delete(oldestIp);
    }

    return function check(socket) {
        const now = Date.now();
        prune(now);
        const ip = clientIp(socket);
        let bucket = buckets.get(ip);
        if (!bucket || now - bucket.startedAt > windowMs) {
            bucket = { count: 0, startedAt: now };
            buckets.set(ip, bucket);
        }
        if (bucket.count >= limit) return { allow: false, ip };
        bucket.count += 1;
        return { allow: true, ip };
    };
}

module.exports = { clientIp, createConnectionGuard, createIpWindowLimiter };