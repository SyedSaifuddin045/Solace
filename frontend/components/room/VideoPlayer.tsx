"use client";
import { Component, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from "react";
import { useRoomStore, type Track } from "@/lib/store";
import { BACKEND_URL } from "@/lib/socket";
import { extractYouTubeId } from "@/lib/youtube";
import { loadVolume } from "@/lib/volume";
import { pushToast } from "@/components/room/ToastStack";

/**
 * Audio player using HTML5 <audio> element with proxied audio URL.
 *
 * Audio is fetched through backend proxy to avoid CORS issues with googlevideo.com.
 * Sync: server broadcasts { position, updatedAt } → audio.currentTime = position + elapsed.
 *
 * Stream failures (proxy 502/504, expired googlevideo URL, geo-block) fire the
 * media `error` event — `onStreamError` lets TrackPlayback swap to the YouTube
 * embed fallback automatically instead of playing silence.
 */
export function AudioPlayer({ onStreamError }: { onStreamError?: () => void }) {
  const track = useRoomStore((s) => s.state.playback.track);
  const status = useRoomStore((s) => s.state.playback.status);
  const position = useRoomStore((s) => s.state.playback.position);
  const updatedAt = useRoomStore((s) => s.state.playback.updatedAt);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastStatusRef = useRef<string>("");
  const failedRef = useRef(false);
  const freshSeekRef = useRef(false);
  const unlockCleanupRef = useRef<(() => void) | null>(null);

  // Autoplay policy: unmuted play() outside a user gesture is rejected
  // (NotAllowedError — NOT the media `error` event). Robust unlock:
  // 1. try unmuted play() (works while a user gesture is still active);
  // 2. on rejection, start the element MUTED (muted autoplay is always
  //    allowed) so the stream progresses, then unmute/resume on the next
  //    gesture anywhere in the window.
  const installUnlock = (audio: HTMLAudioElement) => {
    if (unlockCleanupRef.current) return;
    const resume = () => {
      audio.muted = false;
      if (audio.paused && audio.src) {
        audio.play().catch(() => {});
      }
    };
    const events = ["pointerdown", "keydown", "touchstart"] as const;
    events.forEach((ev) => window.addEventListener(ev, resume, true));
    unlockCleanupRef.current = () =>
      events.forEach((ev) => window.removeEventListener(ev, resume, true));
  };

  const playWithUnlock = (audio: HTMLAudioElement, reason: string) => {
    audio.muted = false;
    const p = audio.play();
    if (p) {
      p.catch(() => {
        console.debug(`[solace:FE] ${reason} — autoplay blocked, starting muted (unlock on next gesture)`);
        audio.muted = true;
        const mp = audio.play();
        if (mp) mp.catch(() => {});
        installUnlock(audio);
      });
    }
  };

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
    // Personal persisted volume — a fresh element defaults to 1, so apply
    // it here instead of depending on SongWidget's effect ordering (it
    // mounts before this engine and never re-runs when the engine appears).
    audio.volume = loadVolume();
    audio.preload = "auto";
    audioRef.current = audio;

    // Expose globally for SongWidget progress tracking
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__solaceAudio = audio;

    return () => {
      audio.pause();
      audio.src = "";
      unlockCleanupRef.current?.();
      unlockCleanupRef.current = null;
      audioRef.current = null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).__solaceAudio;
    };
  }, []);

  // Load new audio URL
  // NOTE: deps intentionally omit onStreamError/rawAudioUrl/track — the error
  // listener effect below guards against repeated fallback triggers, and
  // re-running this on every render would reset the failure gate per render.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    // New src resets the failure gate (a later track may stream fine).
    failedRef.current = false;
    if (!audioUrl) {
      audio.pause();
      audio.src = "";
      // Track exists but carries no playable stream URL (e.g. a peer resolved
      // it straight to embed) — bail to the fallback.
      if (track && !rawAudioUrl && onStreamError) {
        failedRef.current = true;
        onStreamError();
      }
      return;
    }
    if (audio.src !== audioUrl) {
      audio.src = audioUrl;
      audio.load();
      // A freshly-assigned src has no meaningful position — mark it so the
      // sync effect positions it to the room target unconditionally.
      freshSeekRef.current = true;
      // New track while status playing — resume playback after src swap
      if (status === "playing") {
        playWithUnlock(audio, "audio autoplay blocked");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl, status]);

  // Media `error` = stream fetch/proxy failed. Swap to embed fallback once.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !onStreamError) return;
    const fail = () => {
      if (failedRef.current) return;
      failedRef.current = true;
      console.debug("[solace:FE] audio stream error — falling back to embed", { src: audio.currentSrc });
      onStreamError();
    };
    audio.addEventListener("error", fail);
    return () => audio.removeEventListener("error", fail);
  }, [onStreamError]);

  // Sync play/pause/seek with store — runs on every state change
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;

    if (status === "playing") {
      // Always recalculate target position on play/seek
      const elapsed = (Date.now() - updatedAt) / 1000;
      const targetTime = Math.max(0, position + elapsed);
      // A freshly-loaded element always needs positioning, even when the room
      // is within 2s of the broadcast anchor — a fresh element's currentTime
      // is 0 regardless. Without this, a JOINING client skips the first seek
      // and plays from 0 while the room advances; the sync effect only re-runs
      // on explicit playback events, so the desync persists.
      const justLoaded = freshSeekRef.current;
      if (justLoaded || Math.abs(audio.currentTime - targetTime) > 2) {
        audio.currentTime = targetTime;
        freshSeekRef.current = false;
      }
      if (lastStatusRef.current !== "play") {
        lastStatusRef.current = "play";
        playWithUnlock(audio, "audio play blocked");
      }
    } else {
      // Paused — always sync position
      const targetTime = Math.max(0, position);
      const justLoaded = freshSeekRef.current;
      if (justLoaded || Math.abs(audio.currentTime - targetTime) > 2) {
        audio.currentTime = targetTime;
        freshSeekRef.current = false;
      }
      if (lastStatusRef.current !== "pause") {
        lastStatusRef.current = "pause";
        audio.pause();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  muted: boolean;
  currentSrc: string;
  /** Resume playback — safe to call during a user gesture. */
  play(): void;
  /** Current volume 0–1. */
  readonly volume: number;
  /** Set volume 0–1. Personal preference, applies to this client only. */
  setVolume(volume: number): void;
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
      muted: audio.muted,
      currentSrc: audio.src,
      get volume() {
        return audio.volume;
      },
      seekTo: (s: number) => {
        audio.currentTime = s;
      },
      setVolume: (v: number) => {
        audio.volume = Math.min(1, Math.max(0, v));
      },
      play: () => {
        audio.muted = false;
        audio.play().catch(() => {});
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
  getVolume(): number;
  setVolume(volume: number): void;
  getVideoData(): { video_id?: string };
  destroy(): void;
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
  // The node handed to `new YT.Player(...)`. The YT API replaces it with its
  // own wrapper (see the boot effect below) — React must never own it.
  const mountRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const lastStatusRef = useRef<string>("");
  const lastVideoIdRef = useRef<string | null>(null);
  const freshSeekRef = useRef(false);
  const statusRef = useRef(status);
  const positionRef = useRef(position);
  const updatedAtRef = useRef(updatedAt);

  const videoId = track ? extractYouTubeId(track.url) : null;

  // The IFrame API is a hostile third-party guest: playerRef.current may hold
  // a non-player object (adblocker patches, a failed `new YT.Player`,
  // double-ready races) whose methods are missing. Guard every call.
  const safePlayer = (): YTPlayer | null => {
    const p = playerRef.current;
    return p &&
      typeof p.getCurrentTime === "function" &&
      typeof p.getDuration === "function" &&
      typeof p.playVideo === "function" &&
      typeof p.pauseVideo === "function" &&
      typeof p.loadVideoById === "function" &&
      typeof p.seekTo === "function" &&
      typeof p.getVideoData === "function" &&
      typeof p.getVolume === "function" &&
      typeof p.setVolume === "function"
      ? p
      : null;
  };

  const applyState = () => {
    const player = safePlayer();
    if (!player) return;
    const id = lastVideoIdRef.current;
    try {
      if (statusRef.current === "playing") {
        const elapsed = (Date.now() - updatedAtRef.current) / 1000;
        const targetTime = Math.max(0, positionRef.current + elapsed);
        // Fresh embed players (join / new video) have no meaningful position
        // yet — always seek to target, even when it's < 2s or > 600s off.
        const justLoaded = freshSeekRef.current;
        const diff = Math.abs(player.getCurrentTime() - targetTime);
        if ((justLoaded || diff > 2) && (justLoaded || diff < 600)) {
          player.seekTo(targetTime, true);
          freshSeekRef.current = false;
        }
        if (lastStatusRef.current !== "play") {
          lastStatusRef.current = "play";
          player.playVideo();
        }
      } else {
        const targetTime = Math.max(0, positionRef.current);
        const justLoaded = freshSeekRef.current;
        const diff = Math.abs(player.getCurrentTime() - targetTime);
        if ((justLoaded || diff > 2) && (justLoaded || diff < 600)) {
          player.seekTo(targetTime, true);
          freshSeekRef.current = false;
        }
        if (lastStatusRef.current !== "pause") {
          lastStatusRef.current = "pause";
          player.pauseVideo();
        }
      }
    } catch {
      // Never let a broken embed take down the room UI.
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
      // Stale-instance guard: a leftover player (double-ready race, re-boot)
      // would keep playing audio from a detached iframe — destroy it before
      // creating a new one (and drop its mount node too).
      if (playerRef.current || mountRef.current) {
        try {
          if (typeof playerRef.current?.destroy === "function") playerRef.current.destroy();
        } catch {
          // adblock/CSP can make destroy throw — drop the reference anyway
        }
        playerRef.current = null;
        mountRef.current?.remove?.();
        mountRef.current = null;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const YT = (window as any).YT;
      // YT.Player REPLACES its target element: it removes the node from the
      // document and inserts its own wrapper div + iframe, without touching
      // React's tree bookkeeping. React must NEVER own a node the YT API has
      // consumed, or unmount's removeChild(container, parent) throws
      // NotFoundError and the playback engine dies mid-flip. So the
      // containerRef div stays a stable React-owned child, and the player
      // lives in a tiny detached `mount` node appended inside it — a node
      // only this component ever removes.
      const mount = document.createElement("div");
      mount.style.width = "1px";
      mount.style.height = "1px";
      containerRef.current.appendChild(mount);
      mountRef.current = mount;
      try {
        playerRef.current = YT.Player ? new YT.Player(mount, {
          height: "1",
          width: "1",
          playerVars: { playsinline: 1, controls: 0 },
          events: {
            onReady: () => {
              try {
                const p = safePlayer();
                if (!p) return;
                // Fresh player defaults to 100 — apply persisted volume now that
                // the iframe is usable (SongWidget mounted before this engine).
                p.setVolume(Math.round(loadVolume() * 100));
                // Player just spawned with no position — force the room target.
                freshSeekRef.current = true;
                if (lastVideoIdRef.current) p.loadVideoById(lastVideoIdRef.current);
                applyState();
              } catch {
                // degraded embed — nothing to sync, stay silent
              }
            },
            onStateChange: (e: { data: number }) => {
              // YT.PlayerState.ENDED === 0 — signal auto-advance (mirrors the
              // audio element's `ended` event that useAutoAdvance listens for).
              if (e.data === 0) {
                window.dispatchEvent(new CustomEvent("solace:track-ended"));
              }
            },
          },
        }) : null;
      } catch {
        // A constructor throw (blocked iframe, adblocker, CSP) must never
        // become an unhandled rejection that takes down the room UI.
        playerRef.current = null;
      }
    });
    return () => {
      cancelled = true;
      // Kill ghost audio: a live YT.Player keeps playing from a detached
      // iframe after unmount. destroy() tears it down (guarded — adblock/CSP
      // can make the method absent or throw). Order matters: destroy() first
      // (kills the audio), then remove the mount node (our own node — React
      // never tracks it, so no NotFoundError), then null the playerRef.
      if (playerRef.current) {
        try {
          if (typeof playerRef.current.destroy === "function") playerRef.current.destroy();
        } catch {
          // ignore — reference dropped anyway
        }
        playerRef.current = null;
      }
      mountRef.current?.remove?.();
      mountRef.current = null;
    };

  }, []);

  // Expose engine for SongWidget progress/seek (mirrors window.__solaceAudio)
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__solaceEmbed = {
      get currentTime() {
        return safePlayer()?.getCurrentTime() ?? 0;
      },
      get duration() {
        return safePlayer()?.getDuration() ?? 0;
      },
      muted: false,
      get currentSrc() {
        return safePlayer()?.getVideoData().video_id ?? "";
      },
      get volume() {
        return (safePlayer()?.getVolume() ?? 0) / 100;
      },
      seekTo(seconds: number) {
        safePlayer()?.seekTo(Math.max(0, seconds), true);
      },
      setVolume(volume: number) {
        safePlayer()?.setVolume(Math.round(Math.min(1, Math.max(0, volume)) * 100));
      },
      play() {
        safePlayer()?.playVideo();
      },
    };
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).__solaceEmbed;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

// Video id changed → load the new video, then re-apply state
  useEffect(() => {
    if (!videoId) return;
    const player = safePlayer();
    if (lastVideoIdRef.current !== videoId) {
      lastVideoIdRef.current = videoId;
      // New video in the player — no meaningful position until it's sought.
      freshSeekRef.current = true;
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
 *
 * Runtime auto-fallback: if the proxied stream errors (proxy block, expired
 * googlevideo URL), the same track is swapped to the embed automatically.
 */
export function TrackPlayback() {
  const track = useRoomStore((s) => s.state.playback.track);
  const trackUrl = track?.url ?? null;

  // Key the engine subtree by current track url so ANY url transition (incl. a
  // pass through null) fully re-mounts with a fresh fallback latch. Without
  // this, a stale `.active` would survive a track → null → SAME url re-pick and
  // snap the re-picked song straight to the embed with no fresh stream attempt.
  // Remounting on a truly NEW url is also always correct: the new track has no
  // error history yet. Re-broadcasts of the SAME url keep the key and preserve
  // the latch (same url + same audioUrl stays embed; a fresh audioUrl yields).
  return <TrackEngine key={trackUrl ?? "no-track"} track={track} trackUrl={trackUrl} />;
}

function TrackEngine({ track, trackUrl }: { track: Track | null; trackUrl: string | null }) {
  const [fallback, setFallback] = useState<{ url: string; audioUrl: string | null; active: boolean } | null>(null);

  const videoId = track ? extractYouTubeId(track.url) : null;

  // Per-track runtime fallback: only counts while the SAME url is current, so
  // a track change (queue advance / new pick) implicitly resets it. The embed
  // also requires the SAME failing audioUrl — when the url gets a FRESH stream
  // URL (backend re-broadcast on auto-advance) the fallback yields and
  // AudioPlayer retries the stream; same url + same dead audioUrl keeps the
  // embed, which prevents error loops.
  const embedFallback =
    trackUrl !== null &&
    fallback?.url === trackUrl &&
    fallback.active &&
    fallback.audioUrl === track?.audioUrl;
  // Mode is decided per client: stream whenever a playable audioUrl exists
  // (track.playMode is informational only), embed only when the track has no
  // stream URL but is a YouTube video, or when the runtime fallback is active
  // for the exact url + audioUrl currently playing.
  const isEmbed = !!videoId && (!track?.audioUrl || embedFallback);

  if (isEmbed) return <YouTubePlayer />;
  return (
    <AudioPlayer
      onStreamError={
        videoId && trackUrl !== null
          ? () => {
              setFallback({ url: trackUrl, audioUrl: track?.audioUrl ?? null, active: true });
              pushToast("stream failed — using embed fallback", "amber");
            }
          : undefined
      }
    />
  );
}

/**
 * Isolates the playback engine from the rest of the room UI.
 *
 * A throw anywhere in the engine subtree (a hostile YT embed, a media element
 * quirk mid-track-swap) would otherwise unmount the ENTIRE React root — there
 * is no boundary above RoomScreen — which runs RoomScreen's cleanup and calls
 * stopRtc(): local mic/cam tracks are stopped and every peer connection is
 * closed. That is how a song change "kills the mic/video transmission".
 * The boundary caps the blast radius to silence instead.
 */
export class PlaybackBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error, _info: ErrorInfo): void {
    console.debug("[solace:FE] playback engine crashed — engine isolated, room UI + RTC preserved", {
      message: error?.message,
    });
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
