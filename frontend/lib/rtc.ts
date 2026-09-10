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
  console.debug("[solace:FE] rtc peer created", { me, to: socketId, iceServers });
  pc = new RTCPeerConnection({ iceServers });
  pc.onicecandidate = (e) => {
    if (e.candidate) {
      console.debug("[solace:FE] rtc onicecandidate", { me, to: socketId, candidate: e.candidate.toJSON() });
      getSocket().emit("rtc:ice", { to: socketId, candidate: e.candidate.toJSON() });
    }
  };
  pc.ontrack = (e) => {
    const stream = e.streams[0] ?? new MediaStream([e.track]);
    const videoTracks = stream.getVideoTracks().length;
    const audioTracks = stream.getAudioTracks().length;
    console.debug("[solace:FE] rtc ontrack", { me, from: socketId, videoTracks, audioTracks, trackKind: e.track.kind });
    useRoomStore.getState().setRemoteStream(socketId, stream);
  };
  localStream?.getTracks().forEach((t) => {
    console.debug("[solace:FE] rtc addTrack", { me, to: socketId, kind: t.kind });
    pc!.addTrack(t, localStream!);
  });
  peers.set(socketId, pc);
  return pc;
}

async function offerTo(socketId: string) {
  const pc = getPeer(socketId);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  console.debug("[solace:FE] rtc offer created", { me, to: socketId, hasSdp: !!pc.localDescription });
  getSocket().emit("rtc:offer", { to: socketId, sdp: pc.localDescription });
}

export async function startRtc({ audio, video }: { audio: boolean; video: boolean }): Promise<void> {
  const socket = getSocket();
  const s = useRoomStore.getState();
  if (!audio && !video) {
    console.debug("[solace:FE] rtc startRtc off-path", { me, audio, video, peers: peers.size, hadLocalStream: !!localStream });
    localStream?.getTracks().forEach((t) => t.stop());
    localStream = null;
    peers.forEach((pc) => pc.close());
    peers.clear();
    s.setLocalMedia(false, false);
    socket.emit("rtc:media", { audio: false, video: false });
    return;
  }

  // Idempotent: skip if requested flags match current localStream
  if (localStream) {
    const hasAudio = localStream.getAudioTracks().length > 0;
    const hasVideo = localStream.getVideoTracks().length > 0;
    if (hasAudio === audio && hasVideo === video) {
      console.debug("[solace:FE] rtc startRtc idempotent skip", { me, audio, video });
      return;
    }
  }

  const constraints = { audio, video: video ? { width: { ideal: 640 }, height: { ideal: 480 } } : false };
  console.debug("[solace:FE] rtc getUserMedia START", { me, constraints });
  try {
    localStream = await navigator.mediaDevices.getUserMedia(constraints as MediaStreamConstraints);
  } catch (err) {
    const e = err as DOMException;
    console.debug("[solace:FE] rtc getUserMedia FAILURE", { me, name: e?.name, message: e?.message });
    throw err;
  }
  console.debug("[solace:FE] rtc getUserMedia SUCCESS", {
    me,
    videoTracks: localStream.getVideoTracks().length,
    audioTracks: localStream.getAudioTracks().length,
  });
  s.setLocalMedia(audio, video);
  socket.emit("rtc:media", { audio, video });
  // Swap tracks on existing peers and renegotiate
  for (const [socketId, pc] of peers) {
    pc.getSenders().forEach((sender) => {
      if (sender.track) {
        console.debug("[solace:FE] rtc removeTrack", { me, to: socketId, kind: sender.track.kind });
        pc.removeTrack(sender);
      }
    });
    localStream!.getTracks().forEach((t) => {
      console.debug("[solace:FE] rtc addTrack", { me, to: socketId, kind: t.kind });
      pc.addTrack(t, localStream!);
    });
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    console.debug("[solace:FE] rtc renegotiate offer", { me, to: socketId, hasSdp: !!pc.localDescription });
    getSocket().emit("rtc:offer", { to: socketId, sdp: pc.localDescription });
  }
  // Create offers to any new members not yet peer'd
  await Promise.all(
    s.members
      .filter((m: Member) => m.socketId !== me && !peers.has(m.socketId))
      .map((m: Member) => offerTo(m.socketId))
  );
}

export function initRtc(): void {
  if (inited) return;
  inited = true;
  const socket = getSocket();
  console.debug("[solace:FE] rtc initRtc listeners registered", [
    "rtc:offer",
    "rtc:answer",
    "rtc:ice",
    "room:member_left",
    "connect",
  ]);
  socket.on("rtc:offer", async (p: { from: string; sdp: RTCSessionDescription }) => {
    const pc = getPeer(p.from);
    console.debug("[solace:FE] rtc offer received", { me, from: p.from, hasSdp: !!p.sdp });
    await pc.setRemoteDescription(new RTCSessionDescription(p.sdp));
    console.debug("[solace:FE] rtc remote description set", { me, from: p.from, type: "offer" });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    console.debug("[solace:FE] rtc answer created", { me, to: p.from, hasSdp: !!pc.localDescription });
    socket.emit("rtc:answer", { to: p.from, sdp: pc.localDescription });
  });
  socket.on("rtc:answer", async (p: { from: string; sdp: RTCSessionDescription }) => {
    const pc = peers.get(p.from);
    console.debug("[solace:FE] rtc answer received", { me, from: p.from, hasLocalRemoteDescription: pc?.remoteDescription !== null && pc?.remoteDescription !== undefined });
    if (pc && pc.signalingState === "have-local-offer") {
      await pc.setRemoteDescription(new RTCSessionDescription(p.sdp));
      console.debug("[solace:FE] rtc remote description set", { me, from: p.from, type: "answer" });
    }
  });
  socket.on("rtc:ice", async (p: { from: string; candidate: RTCIceCandidateInit }) => {
    const pc = peers.get(p.from);
    console.debug("[solace:FE] rtc ice received", { me, from: p.from, hasPeer: !!pc });
    if (pc) await pc.addIceCandidate(new RTCIceCandidate(p.candidate)).catch(() => {});
    console.debug("[solace:FE] rtc ice candidate add", { me, from: p.from });
  });
  socket.on("room:member_left", (p: { socketId: string }) => {
    console.debug("[solace:FE] rtc room:member_left cleanup", { me, left: p.socketId });
    const pc = peers.get(p.socketId);
    if (pc) {
      pc.close();
      peers.delete(p.socketId);
    }
    useRoomStore.getState().setRemoteStream(p.socketId, null);
  });
  socket.on("connect", () => {
    me = socket.id ?? null;
    console.debug("[solace:FE] rtc connected", { me });
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
      if (stream.getAudioTracks().length === 0) {
        analysers.delete(id);
        return;
      }
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
    if (talking.length) console.debug("[solace:FE] rtc speaking", { me, talking });
    s.setSpeaking(talking);
  }, 300);
}