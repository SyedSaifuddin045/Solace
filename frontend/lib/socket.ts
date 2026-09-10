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
  socket = io(BACKEND_URL, { transports: ["websocket"] });
  socket.on("rtc:config", (p) => rtcConfigListeners.forEach((fn) => fn(p as { iceServers: RTCIceServer[] })));
  return socket;
}