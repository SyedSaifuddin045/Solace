import { describe, it, expect, beforeEach } from "vitest";
import { useRoomStore, type Member } from "@/lib/store";

beforeEach(() => useRoomStore.setState({ roomId: null, members: [], error: null, connected: false, pendingTimerMinutes: null, state: {
  playback: { status: "paused", track: null, position: 0, updatedAt: 0 },
  queue: [],
  wallpaper: { url: null, kind: "image", changedBy: null, updatedAt: 0 },
  wallpapers: [],
  activity: [],
  title: "",
  timer: { status: "idle", durationMs: 0, remainingMs: 0, endsAt: null, startedBy: null, startedAt: null, updatedAt: 0 },
  protected: false,
}}));

describe("applyEvent — room:joined", () => {
  it("hydrates roomId, members, full state", () => {
    useRoomStore.getState().applyEvent("room:joined", {
      roomId: "ABC123",
      members: [{ socketId: "s1", displayName: "Saif", isHost: true, audioOn: false, videoOn: false }],
      state: { playback: { status: "playing", track: { url: "u" }, position: 3, updatedAt: 1 },
               wallpaper: { url: "w", kind: "image", changedBy: null, updatedAt: 1 },
               wallpapers: [], activity: [], title: "3am × kitchen lofi",
               timer: { status: "idle", durationMs: 0, remainingMs: 0, endsAt: null, startedBy: null, startedAt: null, updatedAt: 1 } },
    });
    const s = useRoomStore.getState();
    expect(s.roomId).toBe("ABC123");
    expect(s.members).toHaveLength(1);
    expect(s.state.title).toBe("3am × kitchen lofi");
    expect(s.state.playback.status).toBe("playing");
  });
});

describe("applyEvent — incremental events", () => {
  it("room:member_joined appends", () => {
    useRoomStore.getState().applyEvent("room:member_joined", { member: { socketId: "s2", displayName: "Dani", isHost: false, audioOn: true, videoOn: false } });
    expect(useRoomStore.getState().members.map((m: Member) => m.socketId)).toContain("s2");
  });
  it("room:member_left removes", () => {
    useRoomStore.setState({ members: [{ socketId: "s1", displayName: "A", isHost: true, audioOn: false, videoOn: false }] });
    useRoomStore.getState().applyEvent("room:member_left", { socketId: "s1" });
    expect(useRoomStore.getState().members).toHaveLength(0);
  });
  it("room:activity appends and caps at 50", () => {
    for (let i = 0; i < 55; i++) {
      useRoomStore.getState().applyEvent("room:activity", { entry: { id: `e${i}`, type: "chat", actor: { socketId: "s", displayName: "X" }, detail: "hi", at: i } });
    }
    expect(useRoomStore.getState().state.activity).toHaveLength(50);
    expect(useRoomStore.getState().state.activity[0].id).toBe("e5"); // oldest dropped
  });
  it("playback:state updates playback", () => {
    useRoomStore.getState().applyEvent("playback:state", { status: "paused", track: { url: "u" }, position: 12, updatedAt: 9, changedBy: "s" });
    expect(useRoomStore.getState().state.playback.position).toBe(12);
  });
  it("wallpaper:state updates wallpaper", () => {
    useRoomStore.getState().applyEvent("wallpaper:state", { url: "v", kind: "video", changedBy: "s", updatedAt: 9 });
    expect(useRoomStore.getState().state.wallpaper.url).toBe("v");
    expect(useRoomStore.getState().state.wallpaper.kind).toBe("video");
  });
  it("wallpaper:uploads replaces library", () => {
    useRoomStore.getState().applyEvent("wallpaper:uploads", { uploads: [{ id: "u1", url: "x", kind: "image", contentType: "image/png", size: 1, originalName: "a.png", uploadedBy: "s", uploadedAt: 1 }] });
    expect(useRoomStore.getState().state.wallpapers).toHaveLength(1);
  });
  it("timer:state updates timer", () => {
    useRoomStore.getState().applyEvent("timer:state", { status: "running", durationMs: 1_500_000, remainingMs: 600_000, endsAt: 9999, startedBy: "s", startedAt: 1, updatedAt: 2 });
    expect(useRoomStore.getState().state.timer.status).toBe("running");
  });
  it("room:error sets error", () => {
    useRoomStore.getState().applyEvent("room:error", { code: "ROOM_FULL", message: "room is full" });
    expect(useRoomStore.getState().error?.code).toBe("ROOM_FULL");
  });
  it("rtc:media_state updates member audio/video flags", () => {
    useRoomStore.setState({ members: [{ socketId: "s1", displayName: "A", isHost: false, audioOn: false, videoOn: false }] });
    useRoomStore.getState().applyEvent("rtc:media_state", { socketId: "s1", audio: true, video: true });
    const m = useRoomStore.getState().members[0];
    expect(m.audioOn).toBe(true);
    expect(m.videoOn).toBe(true);
  });
  it("room:title_state updates title", () => {
    useRoomStore.getState().applyEvent("room:title_state", { title: "new", changedBy: "s", updatedAt: 1 });
    expect(useRoomStore.getState().state.title).toBe("new");
  });
  it("unknown events are ignored safely", () => {
    expect(() => useRoomStore.getState().applyEvent("something:else", {})).not.toThrow();
  });
});

describe("armTimer + pendingTimerMinutes", () => {
  it("armTimer sets pendingTimerMinutes", () => {
    useRoomStore.getState().armTimer(25);
    expect(useRoomStore.getState().pendingTimerMinutes).toBe(25);
  });
  it("armTimer(null) clears pendingTimerMinutes", () => {
    useRoomStore.getState().armTimer(45);
    useRoomStore.getState().armTimer(null);
    expect(useRoomStore.getState().pendingTimerMinutes).toBeNull();
  });
});

describe("reset clears pendingTimerMinutes", () => {
  it("reset sets pendingTimerMinutes to null", () => {
    useRoomStore.getState().armTimer(60);
    useRoomStore.getState().reset();
    expect(useRoomStore.getState().pendingTimerMinutes).toBeNull();
  });
});