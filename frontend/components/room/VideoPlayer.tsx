"use client";
import { useEffect, useRef } from "react";
import { useRoomStore } from "@/lib/store";
import { BACKEND_URL } from "@/lib/socket";
import { extractYouTubeId } from "@/lib/youtube";

/**
 * Audio player using HTML5 <audio> element with proxied audio URL.
 *
 * Audio is fetched through backend proxy to avoid CORS issues with googlevideo.com.
 * Sync: server broadcasts { position, updatedAt } → audio.currentTime = position + elapsed.
 */
export function AudioPlayer() {
  const track = useRoomStore((s) => s.state.playback.track);
  const status = useRoomStore((s) => s.state.playback.status);
  const position = useRoomStore((s) => s.state.playback.position);
  const updatedAt = useRoomStore((s) => s.state.playback.updatedAt);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastStatusRef = useRef<string>("");

  // Build proxied audio URL — attach roomId + socketId for server membership gate
  const rawAudioUrl = track?.audioUrl || null;
  const roomId = useRoomStore((s) => s.roomId);
  const socketId = useRoomStore((s) => s.socketId);
  const audioUrl = rawAudioUrl && roomId && socketId
    ? `${BACKEND_URL}/track/proxy?url=${encodeURIComponent(rawAudioUrl)}&roomId=${encodeURIComponent(roomId)}&socketId=${encodeURIComponent(socketId)}`
    : null;

  // Create audio element on mount
  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audioRef.current = audio;

    // Expose globally for SongWidget progress tracking
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__solaceAudio = audio;

    return () => {
      audio.pause();
      audio.src = "";
      audioRef.current = null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).__solaceAudio;
    };
  }, []);

  // Load new audio URL
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audioUrl) {
      audio.pause();
      audio.src = "";
      return;
    }
    if (audio.src !== audioUrl) {
      audio.src = audioUrl;
      audio.load();
      // New track while status playing — resume playback after src swap
      if (status === "playing") {
        audio.play().catch(() => {
          console.debug("[solace:FE] audio autoplay blocked — needs user gesture");
        });
      }
    }
  }, [audioUrl, status]);

  // Sync play/pause/seek with store — runs on every state change
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;

    if (status === "playing") {
      // Always recalculate target position on play/seek
      const elapsed = (Date.now() - updatedAt) / 1000;
      const targetTime = Math.max(0, position + elapsed);
      if (Math.abs(audio.currentTime - targetTime) > 2) {
        audio.currentTime = targetTime;
      }
      if (lastStatusRef.current !== "play") {
        lastStatusRef.current = "play";
        audio.play().catch(() => {
          console.debug("[solace:FE] audio play blocked — needs user gesture");
        });
      }
    } else {
      // Paused — always sync position
      const targetTime = Math.max(0, position);
      if (Math.abs(audio.currentTime - targetTime) > 2) {
        audio.currentTime = targetTime;
      }
      if (lastStatusRef.current !== "pause") {
        lastStatusRef.current = "pause";
        audio.pause();
      }
    }
  }, [status, audioUrl, position, updatedAt]);

  return null;
}

/** Get the current audio element for progress tracking */
export function getAudioElement(): HTMLAudioElement | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).__solaceAudio as HTMLAudioElement | null;
}

export interface PlaybackEngine {
  currentTime: number;
  duration: number;
  seekTo(seconds: number): void;
}

export function getEmbedEngine(): PlaybackEngine | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).__solaceEmbed as PlaybackEngine | null;
}

/** Unified engine: stream mode reads <audio>, embed mode reads the YT iframe. */
export function getPlaybackEngine(): PlaybackEngine | null {
  const audio = getAudioElement();
  if (audio) {
    return {
      currentTime: audio.currentTime,
      duration: audio.duration || 0,
      seekTo: (s: number) => {
        audio.currentTime = s;
      },
    };
  }
  return getEmbedEngine();
}

// ---------------------------------------------------------------------------
// YouTube embed fallback player (Option B).
// Renders the video hidden off-screen; audio originates from YouTube's own
// embed, so no backend extraction, no proxy, no bot-wall. Sync obeys the
// room's playback state exactly like AudioPlayer does.
// ---------------------------------------------------------------------------

type YTPlayer = {
  loadVideoById(id: string): void;
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
};

let ytApiPromise: Promise<unknown> | null = null;
function loadYouTubeApi(): Promise<unknown> {
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve) => {
    if (typeof window !== "undefined" && (window as unknown as { YT?: { Player?: unknown } }).YT?.Player) {
      resolve(undefined);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).onYouTubeIframeAPIReady = () => resolve(undefined);
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  });
  return ytApiPromise;
}

export function YouTubePlayer() {
  const track = useRoomStore((s) => s.state.playback.track);
  const status = useRoomStore((s) => s.state.playback.status);
  const position = useRoomStore((s) => s.state.playback.position);
  const updatedAt = useRoomStore((s) => s.state.playback.updatedAt);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const lastStatusRef = useRef<string>("");
  const lastVideoIdRef = useRef<string | null>(null);
  const statusRef = useRef(status);
  const positionRef = useRef(position);
  const updatedAtRef = useRef(updatedAt);

  const videoId = track ? extractYouTubeId(track.url) : null;

  const applyState = () => {
    const player = playerRef.current;
    const id = lastVideoIdRef.current;
    if (!player || !id) return;
    if (statusRef.current === "playing") {
      const elapsed = (Date.now() - updatedAtRef.current) / 1000;
      const targetTime = Math.max(0, positionRef.current + elapsed);
      const diff = Math.abs(player.getCurrentTime() - targetTime);
      if (diff > 2 && diff < 600) {
        player.seekTo(targetTime, true);
      }
      if (lastStatusRef.current !== "play") {
        lastStatusRef.current = "play";
        player.playVideo();
      }
    } else {
      const targetTime = Math.max(0, positionRef.current);
      const diff = Math.abs(player.getCurrentTime() - targetTime);
      if (diff > 2 && diff < 600) {
        player.seekTo(targetTime, true);
      }
      if (lastStatusRef.current !== "pause") {
        lastStatusRef.current = "pause";
        player.pauseVideo();
      }
    }
  };

  // Keep latest state available to the (async) IFrame API callbacks
  useEffect(() => {
    statusRef.current = status;
    positionRef.current = position;
    updatedAtRef.current = updatedAt;
  }, [status, position, updatedAt]);

  // Boot the API + create the player once
  useEffect(() => {
    let cancelled = false;
    loadYouTubeApi().then(() => {
      if (cancelled || !containerRef.current) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const YT = (window as any).YT;
      playerRef.current = YT.Player ? new YT.Player(containerRef.current, {
        height: "1",
        width: "1",
        playerVars: { playsinline: 1, controls: 0 },
        events: {
          onReady: () => {
            const p = playerRef.current;
            if (!p) return;
            if (lastVideoIdRef.current) p.loadVideoById(lastVideoIdRef.current);
            applyState();
          },
        },
      }) : null;
    });
    return () => {
      cancelled = true;
    };
     
  }, []);

  // Expose engine for SongWidget progress/seek (mirrors window.__solaceAudio)
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__solaceEmbed = {
      get currentTime() {
        return playerRef.current ? playerRef.current.getCurrentTime() : 0;
      },
      get duration() {
        return playerRef.current ? playerRef.current.getDuration() : 0;
      },
      seekTo(seconds: number) {
        playerRef.current?.seekTo(Math.max(0, seconds), true);
      },
    };
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).__solaceEmbed;
    };
  }, []);

  // Video id changed → load the new video, then re-apply state
  useEffect(() => {
    if (!videoId) return;
    const player = playerRef.current;
    if (lastVideoIdRef.current !== videoId) {
      lastVideoIdRef.current = videoId;
      if (player) player.loadVideoById(videoId);
    }
    applyState();
     
  }, [videoId]);

  // Sync play/pause/seek with store
  useEffect(() => {
    applyState();
     
  }, [status, position, updatedAt]);

  if (!videoId) return null;

  return (
    <div
      ref={containerRef}
      aria-hidden
      className="pointer-events-none absolute"
      style={{ width: 1, height: 1, opacity: 0.01, overflow: "hidden" }}
    />
  );
}

/**
 * Renders whichever engine the current track needs: proxied audio stream by
 * default; hidden YouTube embed when the stream couldn't be extracted but the
 * video is embeddable (Option B fallback).
 */
export function TrackPlayback() {
  const track = useRoomStore((s) => s.state.playback.track);
  const isEmbed = track?.playMode === "embed" && !!extractYouTubeId(track.url);
  return isEmbed ? <YouTubePlayer /> : <AudioPlayer />;
}
