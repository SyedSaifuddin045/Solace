import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import { EMPTY_STATE, useRoomStore, type Track } from "@/lib/store";
import { TrackPlayback } from "@/components/room/VideoPlayer";

const YT_URL = "https://www.youtube.com/watch?v=abc123DEFGh";

// jsdom ships no media engine — the element methods used by AudioPlayer would
// throw "not implemented". Stub the surface it touches.
beforeEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proto = HTMLMediaElement.prototype as any;
  proto.play = vi.fn();
  proto.pause = vi.fn();
  proto.load = vi.fn();
  Object.defineProperty(proto, "currentTime", { get: () => 0, set: () => {}, configurable: true });
});

class FakePlayer {
  static instances: FakePlayer[] = [];
  destroy = vi.fn();
  playVideo = vi.fn();
  pauseVideo = vi.fn();
  seekTo = vi.fn();
  loadVideoById = vi.fn();
  getCurrentTime = vi.fn(() => 0);
  getDuration = vi.fn(() => 0);
  getVolume = vi.fn(() => 100);
  setVolume = vi.fn();
  getVideoData = vi.fn(() => ({ video_id: "abc123DEFGh" }));
  constructor() {
    FakePlayer.instances.push(this);
  }
}

function setTrack(track: Track | null, status: "playing" | "paused" = "playing") {
  act(() => {
    useRoomStore.setState({
      roomId: "ROOM01",
      socketId: "SOCK1",
      state: {
        ...EMPTY_STATE,
        playback: {
          status,
          track,
          position: track ? 30 : 0,
          updatedAt: Date.now(),
        },
      },
    });
  });
}

describe("TrackPlayback per-client mode + fallback self-heal + YT teardown", () => {
  beforeEach(() => {
    FakePlayer.instances = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).YT = { Player: FakePlayer };
  });

  it("A1: streams a track that has audioUrl even when playMode is embed (engine ignores mode)", () => {
    setTrack({ url: YT_URL, title: "x", audioUrl: "https://stream.example/a1.mp3", playMode: "embed" });
    render(<TrackPlayback />);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((window as any).__solaceAudio).toBeTruthy();
    expect(document.querySelector('div[aria-hidden="true"]')).toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((window as any).__solaceEmbed).toBeUndefined();
  });

  it("A2: renders the YouTube embed when the track has a videoId but no audioUrl", async () => {
    setTrack({ url: YT_URL });
    render(<TrackPlayback />);
    await waitFor(() => expect(FakePlayer.instances).toHaveLength(1));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((window as any).__solaceEmbed).toBeTruthy();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((window as any).__solaceAudio).toBeUndefined();
    expect(document.querySelector('div[aria-hidden="true"]')).not.toBeNull();
  });

  it("C3: stream error → embed fallback; same url with a fresh audioUrl flips back to the stream", async () => {
    setTrack({ url: YT_URL, audioUrl: "https://stream.example/a1.mp3" });
    render(<TrackPlayback />);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((window as any).__solaceAudio).toBeTruthy();

    // stream fetch fails → same track swaps to the embed fallback
    act(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__solaceAudio.dispatchEvent(new Event("error"));
    });
    await waitFor(() => expect(FakePlayer.instances).toHaveLength(1));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((window as any).__solaceEmbed).toBeTruthy();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((window as any).__solaceAudio).toBeUndefined();

    // same url re-broadcast with a NEW audioUrl → fallback yields, stream retries
    setTrack({ url: YT_URL, audioUrl: "https://stream.example/a2.mp3" });
    await waitFor(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((window as any).__solaceAudio).toBeTruthy();
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((window as any).__solaceEmbed).toBeUndefined();
  });

  it("C4: same url with the SAME audioUrl after an error stays on the embed (no error loop)", async () => {
    setTrack({ url: YT_URL, audioUrl: "https://stream.example/a1.mp3" });
    render(<TrackPlayback />);
    act(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__solaceAudio.dispatchEvent(new Event("error"));
    });
    await waitFor(() => expect(FakePlayer.instances).toHaveLength(1));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((window as any).__solaceEmbed).toBeTruthy();

    // same url + same audioUrl re-broadcast → fallback stays active
    setTrack({ url: YT_URL, title: "same", audioUrl: "https://stream.example/a1.mp3" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((window as any).__solaceEmbed).toBeTruthy();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((window as any).__solaceAudio).toBeUndefined();
  });

  it("D5: unmounting the YouTube player destroys the YT.Player instance (kills ghost audio)", async () => {
    setTrack({ url: YT_URL });
    const { unmount } = render(<TrackPlayback />);
    await waitFor(() => expect(FakePlayer.instances).toHaveLength(1));
    const player = FakePlayer.instances[0];
    unmount();
    expect(player.destroy).toHaveBeenCalledTimes(1);
  });
});