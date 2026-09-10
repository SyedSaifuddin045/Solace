import { getSocket, onRtcConfig } from "@/lib/socket";
import { useRoomStore, type Member } from "@/lib/store";

let localStream: MediaStream | null = null;
let me: string | null = null;
let inited = false;
const peers = new Map<string, RTCPeerConnection>();
let iceServers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

onRtcConfig((cfg) => {
  if (cfg?.iceServers?.length) iceServers = cfg.iceServers;
});

function getPeer(socketId: string): RTCPeerConnection {
  let pc = peers.get(socketId);
  if (pc) return pc;
  pc = new RTCPeerConnection({ iceServers });
  pc.onicecandidate = (e) => {
    if (e.candidate) getSocket().emit("rtc:ice", { to: socketId, candidate: e.candidate.toJSON() });
  };
  pc.ontrack = (e) => {
    useRoomStore.getState().setRemoteStream(socketId, e.streams[0] ?? new MediaStream([e.track]));
  };
  localStream?.getTracks().forEach((t) => pc!.addTrack(t, localStream!));
  peers.set(socketId, pc);
  return pc;
}

async function offerTo(socketId: string) {
  const pc = getPeer(socketId);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  getSocket().emit("rtc:offer", { to: socketId, sdp: pc.localDescription });
}

export async function startRtc({ audio, video }: { audio: boolean; video: boolean }): Promise<void> {
  const socket = getSocket();
  const s = useRoomStore.getState();
  if (!audio && !video) {
    localStream?.getTracks().forEach((t) => t.stop());
    localStream = null;
    peers.forEach((pc) => pc.close());
    peers.clear();
    s.setLocalMedia(false, false);
    socket.emit("rtc:media", { audio: false, video: false });
    return;
  }

  const constraints = { audio, video: video ? { width: { ideal: 640 }, height: { ideal: 480 } } : false };
  localStream = await navigator.mediaDevices.getUserMedia(constraints as MediaStreamConstraints);
  s.setLocalMedia(audio, video);
  socket.emit("rtc:media", { audio, video });
  await Promise.all(
    s.members.filter((m: Member) => m.socketId !== me).map((m: Member) => offerTo(m.socketId))
  );
}

export function initRtc(): void {
  if (inited) return;
  inited = true;
  const socket = getSocket();
  socket.on("rtc:offer", async (p: { from: string; sdp: RTCSessionDescription }) => {
    const pc = getPeer(p.from);
    await pc.setRemoteDescription(new RTCSessionDescription(p.sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit("rtc:answer", { to: p.from, sdp: pc.localDescription });
  });
  socket.on("rtc:answer", async (p: { from: string; sdp: RTCSessionDescription }) => {
    const pc = peers.get(p.from);
    if (pc && pc.remoteDescription === null) await pc.setRemoteDescription(new RTCSessionDescription(p.sdp));
  });
  socket.on("rtc:ice", async (p: { from: string; candidate: RTCIceCandidateInit }) => {
    const pc = peers.get(p.from);
    if (pc) await pc.addIceCandidate(new RTCIceCandidate(p.candidate)).catch(() => {});
  });
  socket.on("room:member_left", (p: { socketId: string }) => {
    const pc = peers.get(p.socketId);
    if (pc) {
      pc.close();
      peers.delete(p.socketId);
    }
    useRoomStore.getState().setRemoteStream(p.socketId, null);
  });
socket.on("connect", () => {
    me = socket.id ?? null;
  });
  if (socket.connected) me = socket.id ?? null;
}

const analysers = new Map<string, AnalyserNode>();
let speakTimer: ReturnType<typeof setInterval> | null = null;

export function startSpeakingDetection(): void {
  if (speakTimer) return;
  const ctx = new AudioContext();
  speakTimer = setInterval(() => {
    const s = useRoomStore.getState();
    const talking: string[] = [];
    Object.entries(s.remoteStreams).forEach(([id, stream]) => {
      let an = analysers.get(id);
      if (!an) {
        const src = ctx.createMediaStreamSource(stream);
        an = ctx.createAnalyser();
        an.fftSize = 512;
        src.connect(an);
        analysers.set(id, an);
      }
      const data = new Uint8Array(an.frequencyBinCount);
      an.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += Math.abs(data[i] - 128);
      const level = sum / data.length;
      if (level > 8) talking.push(id);
    });
    s.setSpeaking(talking);
  }, 300);
}