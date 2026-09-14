"use client";
import { useEffect, useRef } from "react";
import { useRoomStore } from "@/lib/store";
import { BACKEND_URL } from "@/lib/socket";

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

  // Build proxied audio URL
  const rawAudioUrl = track?.audioUrl || null;
  const audioUrl = rawAudioUrl
    ? `${BACKEND_URL}/track/proxy?url=${encodeURIComponent(rawAudioUrl)}`
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
    }
  }, [audioUrl]);

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
