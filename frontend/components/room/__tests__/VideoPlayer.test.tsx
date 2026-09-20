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
  // The real YT IFrame API REPLACES its target element at create time: it
  // removes `el` from the document and inserts its own wrapper (div + iframe),
  // without React's tree bookkeeping ever noticing. Mimic that faithfully, so
  // React's later unmount removeChild(el, parent) throws the same NotFoundError
  // on code that hands a React-owned node to the API.
  wrapper: HTMLElement;
  destroy = vi.fn(() => {
    this.wrapper?.remove?.();
  });
  playVideo = vi.fn();
  pauseVideo = vi.fn();
  seekTo = vi.fn();
  loadVideoById = vi.fn();
  getCurrentTime = vi.fn(() => 0);
  getDuration = vi.fn(() => 0);
  getVolume = vi.fn(() => 100);
  setVolume = vi.fn();
  getVideoData = vi.fn(() => ({ video_id: "abc123DEFGh" }));
  constructor(el: HTMLElement) {
    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-fake-yt-wrapper", "1");
    if (el.parentNode) el.replaceWith(wrapper);
    this.wrapper = wrapper;
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

  it("C5: track cleared then re-picked with the SAME url+audioUrl clears the stale fallback latch", async () => {
    setTrack({ url: YT_URL, audioUrl: "https://stream.example/a1.mp3" });
    render(<TrackPlayback />);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((window as any).__solaceAudio).toBeTruthy();

    // first run fails the stream → embed fallback for this url+audioUrl
    act(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__solaceAudio.dispatchEvent(new Event("error"));
    });
    await waitFor(() => expect(FakePlayer.instances).toHaveLength(1));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((window as any).__solaceEmbed).toBeTruthy();

    // track goes null (session ended / cleared) → embed torn down
    setTrack(null, "paused");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((window as any).__solaceEmbed).toBeUndefined();

    // MUCH later the SAME url + SAME audioUrl is re-picked — the stale latch
    // must be gone, so the stream is attempted fresh (not snapped to embed).
    setTrack({ url: YT_URL, title: "re-picked", audioUrl: "https://stream.example/a1.mp3" });
    await waitFor(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((window as any).__solaceAudio).toBeTruthy();
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((window as any).__solaceEmbed).toBeUndefined();
    expect(FakePlayer.instances).toHaveLength(1);
    expect(document.querySelector('div[aria-hidden="true"]')).toBeNull();
  });

  it("D5: embed→stream flip unmounts the YT player without crashing React (detached mount)", async () => {
    // start on the proxied stream
    setTrack({ url: YT_URL, audioUrl: "https://stream.example/a1.mp3" });
    const { unmount } = render(<TrackPlayback />);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((window as any).__solaceAudio).toBeTruthy();

    // stream fetch fails → same track swaps to the embed (YT player created)
    act(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__solaceAudio.dispatchEvent(new Event("error"));
    });
    await waitFor(() => expect(FakePlayer.instances).toHaveLength(1));
    const player = FakePlayer.instances[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((window as any).__solaceEmbed).toBeTruthy();

    // fresh audioUrl for the same url → flip back to the stream: the embed's
    // React subtree unmounts while destroy() tears down the YT-owned wrapper.
    // The container div must STILL be React-owned — old code handed the
    // container to the YT API, which replaced it, so unmount removeChild threw
    // NotFoundError and the PLAYBACK ENGINE died (both engines gone → silence).
    setTrack({ url: YT_URL, audioUrl: "https://stream.example/a2.mp3" });
    await waitFor(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((window as any).__solaceAudio).toBeTruthy();
    });
    expect(player.destroy).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((window as any).__solaceEmbed).toBeUndefined();
    // container was removed cleanly BY REACT, not destroyed underneath it
    expect(document.querySelector('div[aria-hidden="true"]')).toBeNull();

    // final unmount of the stream tree must not throw either
    unmount();
  });
});