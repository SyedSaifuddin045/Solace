import { create } from "zustand";

export type PlaybackStatus = "playing" | "paused";
export interface Track {
  url: string;
  title?: string;
  artist?: string;
  artwork?: string;
  duration?: number;
  provider?: string;
}
export interface Playback { status: PlaybackStatus; track: Track | null; position: number; updatedAt: number }
export interface WallpaperState { url: string | null; kind: "image" | "video"; changedBy: string | null; updatedAt: number }
export interface UploadMeta { id: string; url: string; kind: "image" | "video"; contentType: string; size: number; originalName: string; uploadedBy: string; uploadedAt: number }
export interface ActivityEntry { id: string; type: string; actor: { socketId: string; displayName: string }; detail: string; at: number }
export interface TimerState { status: "idle" | "running" | "paused"; durationMs: number; remainingMs: number; endsAt: number | null; startedBy: string | null; startedAt: number | null; updatedAt: number }
export interface Member { socketId: string; displayName: string; isHost: boolean; audioOn: boolean; videoOn: boolean; avatar?: string | null }
export interface RoomState {
  playback: Playback;
  wallpaper: WallpaperState;
  wallpapers: UploadMeta[];
  activity: ActivityEntry[];
  title: string;
  timer: TimerState;
}
export interface RoomError { code: string; message: string }

export const EMPTY_STATE: RoomState = {
  playback: { status: "paused", track: null, position: 0, updatedAt: 0 },
  wallpaper: { url: null, kind: "image", changedBy: null, updatedAt: 0 },
  wallpapers: [],
  activity: [],
  title: "",
  timer: { status: "idle", durationMs: 0, remainingMs: 0, endsAt: null, startedBy: null, startedAt: null, updatedAt: 0 },
};

interface RoomStore {
  roomId: string | null;
  members: Member[];
  state: RoomState;
  error: RoomError | null;
  connected: boolean;
  socketId: string | null;
  speaking: string[];
  audioOnLocal: boolean;
  videoOnLocal: boolean;
  remoteStreams: Record<string, MediaStream>;
  pendingTimerMinutes: number | null;
  setConnected: (v: boolean) => void;
  setSocketId: (id: string | null) => void;
  setSpeaking: (ids: string[]) => void;
  setLocalMedia: (audioOn: boolean, videoOn: boolean) => void;
  setRemoteStream: (socketId: string, stream: MediaStream | null) => void;
  armTimer: (minutes: number | null) => void;
  clearError: () => void;
  reset: () => void;
  applyEvent: (name: string, payload: unknown) => void;
}

const upsertMember = (members: Member[], m: Member): Member[] => {
  const i = members.findIndex((x) => x.socketId === m.socketId);
  if (i === -1) return [...members, m];
  const next = [...members];
  next[i] = { ...next[i], ...m };
  return next;
};

function eventSummary(name: string, payload: unknown): unknown {
  const p = payload as Record<string, unknown> & { members?: unknown[]; uploads?: Array<{ url: string; kind: string; id: string }> };
  switch (name) {
    case "room:created":
    case "room:joined":
      return { roomId: p?.roomId, memberCount: p?.members?.length, hasState: !!p?.state };
    case "playback:state":
      return { status: p?.status, track: p?.track, position: p?.position, updatedAt: p?.updatedAt };
    case "wallpaper:state":
      return { url: p?.url, kind: p?.kind, changedBy: p?.changedBy, updatedAt: p?.updatedAt };
    case "timer:state":
      return { status: p?.status, durationMs: p?.durationMs, remainingMs: p?.remainingMs, endsAt: p?.endsAt, startedBy: p?.startedBy };
    case "wallpaper:uploads":
      return { uploadsCount: p?.uploads?.length, items: p?.uploads?.map((u) => ({ id: u?.id, kind: u?.kind, url: u?.url })) };
    default:
      return p;
  }
}

export const useRoomStore = create<RoomStore>((set, get) => ({
  roomId: null,
  members: [],
  state: EMPTY_STATE,
  error: null,
  connected: false,
  socketId: null,
  speaking: [],
  audioOnLocal: false,
  videoOnLocal: false,
  remoteStreams: {},
  pendingTimerMinutes: null,
  setConnected: (v) => set({ connected: v }),
  setSocketId: (id) => set({ socketId: id }),
  setSpeaking: (ids) => set({ speaking: ids }),
  setLocalMedia: (audioOn, videoOn) => set({ audioOnLocal: audioOn, videoOnLocal: videoOn }),
  setRemoteStream: (socketId, stream) =>
    set((s) => {
      const remoteStreams = { ...s.remoteStreams };
      if (stream) remoteStreams[socketId] = stream;
      else delete remoteStreams[socketId];
      return { remoteStreams };
    }),
  armTimer: (minutes) => set({ pendingTimerMinutes: minutes }),
  clearError: () => set({ error: null }),
  reset: () => set({ roomId: null, members: [], state: EMPTY_STATE, error: null, speaking: [], audioOnLocal: false, videoOnLocal: false, remoteStreams: {}, pendingTimerMinutes: null }),

  applyEvent: (name, payload) => {
    const s = get();
    console.debug("[solace:FE] event", name, eventSummary(name, payload));
    switch (name) {
      case "room:created":
      case "room:joined": {
        const p = payload as { roomId: string; members: Member[]; state: RoomState };
        set({ roomId: p.roomId, members: p.members, state: { ...p.state }, error: null });
        break;
      }
      case "room:member_joined": {
        const p = payload as { member: Member };
        if (!p.member) break;
        set({ members: upsertMember(s.members, p.member) });
        break;
      }
      case "room:member_left": {
        const p = payload as { socketId: string };
        set({ members: s.members.filter((m) => m.socketId !== p.socketId) });
        break;
      }
      case "room:activity": {
        const p = payload as { entry: ActivityEntry };
        if (!p.entry) break;
        set({ state: { ...s.state, activity: [...s.state.activity, p.entry].slice(-50) } });
        break;
      }
      case "room:title_state": {
        const p = payload as { title: string };
        set({ state: { ...s.state, title: p.title } });
        break;
      }
      case "playback:state": {
        const p = payload as { status: PlaybackStatus; track: Track | null; position: number; updatedAt: number };
        set({ state: { ...s.state, playback: { status: p.status, track: p.track, position: p.position, updatedAt: p.updatedAt } } });
        break;
      }
      case "wallpaper:state": {
        const p = payload as { url: string | null; kind: "image" | "video"; changedBy: string | null; updatedAt: number };
        set({ state: { ...s.state, wallpaper: { url: p.url, kind: p.kind, changedBy: p.changedBy, updatedAt: p.updatedAt } } });
        break;
      }
      case "wallpaper:uploads": {
        const p = payload as { uploads: UploadMeta[] };
        set({ state: { ...s.state, wallpapers: p.uploads } });
        break;
      }
      case "timer:state": {
        const p = payload as TimerState;
        set({ state: { ...s.state, timer: p } });
        break;
      }
      case "room:error": {
        const p = payload as RoomError;
        set({ error: { code: p.code, message: p.message } });
        break;
      }
      case "rtc:media_state": {
        const p = payload as { socketId: string; audio: boolean; video: boolean };
        set({
          members: s.members.map((m) =>
            m.socketId === p.socketId ? { ...m, audioOn: p.audio, videoOn: p.video } : m
          ),
        });
        break;
      }
      default:
        break; // unknown events ignored
    }
    if (name === "room:error") {
      const p = payload as RoomError;
      console.debug("[solace:FE] room:error", { code: p?.code, message: p?.message });
    }
  },
}));