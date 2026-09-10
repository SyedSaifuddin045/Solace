import { io, type Socket } from "socket.io-client";

export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

// Contract gotcha: rtc:config fires IMMEDIATELY on connect.
// Pre-bind before io() resolves so nothing is missed.
const rtcConfigListeners: ((payload: { iceServers: RTCIceServer[] }) => void)[] = [];
export function onRtcConfig(fn: (payload: { iceServers: RTCIceServer[] }) => void) {
  rtcConfigListeners.push(fn);
  return () => { const i = rtcConfigListeners.indexOf(fn); if (i >= 0) rtcConfigListeners.splice(i, 1); };
}

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (socket) return socket;
  console.debug("[solace:FE] socket created", { url: BACKEND_URL, transports: ["websocket"] });
  socket = io(BACKEND_URL, { transports: ["websocket"] });
  socket.on("rtc:config", (p) => {
    const cfg = p as { iceServers: RTCIceServer[] };
    console.debug("[solace:FE] rtc:config received", {
      iceServersCount: cfg?.iceServers?.length ?? 0,
      firstServerUrls: cfg?.iceServers?.[0]?.urls,
    });
    rtcConfigListeners.forEach((fn) => fn(cfg));
  });
  socket.on("connect", () => {
    console.debug("[solace:FE] connect", { socketId: socket?.id });
  });
  socket.on("disconnect", (reason) => {
    console.debug("[solace:FE] disconnect", { reason, socketId: socket?.id });
  });
  socket.on("connect_error", (err) => {
    console.debug("[solace:FE] connect_error", { message: err.message, socketId: socket?.id });
  });
  return socket;
}