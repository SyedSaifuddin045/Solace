"use client";
import { useEffect, useRef, useCallback } from "react";
import { useRoomStore } from "@/lib/store";

/**
 * Audio player using HTML5 <audio> element with raw audio URL from yt-dlp.
 *
 * Sync model:
 * - Server broadcasts { position, updatedAt } for play/pause/seek/set_track
 * - On play: audio.currentTime = position + elapsed, audio.play()
 * - On pause: audio.pause(), store current position
 * - On seek: audio.currentTime = newPosition
 * - Progress: SongWidget reads audio.currentTime via a shared ref
 */
export function AudioPlayer() {
  const track = useRoomStore((s) => s.state.playback.track);
  const status = useRoomStore((s) => s.state.playback.status);
  const position = useRoomStore((s) => s.state.playback.position);
  const updatedAt = useRoomStore((s) => s.state.playback.updatedAt);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastStatusRef = useRef<string>("");
  const seekingRef = useRef(false);

  const audioUrl = track?.audioUrl || null;

  // Create audio element on mount
  useEffect(() => {
    const audio = new Audio();
    audio.crossOrigin = "anonymous";
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
    // Only reload if URL changed
    if (audio.src !== audioUrl) {
      audio.src = audioUrl;
      audio.load();
    }
  }, [audioUrl]);

  // Sync play/pause with store
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;

    const cmd = status === "playing" ? "play" : "pause";
    if (cmd === lastStatusRef.current) return;
    lastStatusRef.current = cmd;

    if (cmd === "play") {
      // Compute correct position
      const elapsed = (Date.now() - updatedAt) / 1000;
      const targetTime = Math.max(0, position + elapsed);

      // Seek if needed (within 2s tolerance)
      if (Math.abs(audio.currentTime - targetTime) > 2) {
        audio.currentTime = targetTime;
      }

      audio.play().catch(() => {
        console.debug("[solace:FE] audio play blocked — needs user gesture");
      });
    } else {
      audio.pause();
    }
  }, [status, audioUrl, position, updatedAt]);

  // Handle seek events (position changes while playing)
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioUrl || status !== "playing") return;

    // Skip if this is the initial load (handled above)
    if (lastStatusRef.current !== "play") return;

    const elapsed = (Date.now() - updatedAt) / 1000;
    const targetTime = Math.max(0, position + elapsed);

    // Only seek if significantly different (> 3s)
    if (Math.abs(audio.currentTime - targetTime) > 3) {
      seekingRef.current = true;
      audio.currentTime = targetTime;
      seekingRef.current = false;
    }
  }, [position, updatedAt, status, audioUrl]);

  // Nothing to render — audio element is in-memory only
  return null;
}

/** Get the current audio element for progress tracking */
export function getAudioElement(): HTMLAudioElement | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).__solaceAudio as HTMLAudioElement | null;
}
