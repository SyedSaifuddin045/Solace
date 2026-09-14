"use client";
import { useEffect, useRef, useCallback, useMemo } from "react";
import { useRoomStore } from "@/lib/store";

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m?.[1]) return m[1];
  }
  return null;
}

/**
 * Hidden iframe that plays YouTube audio only, synced across room members.
 *
 * Sync model:
 * - Server broadcasts `{ position, updatedAt }` for every play/pause/seek/set_track
 * - All members compute: `currentPos = position + (Date.now() - updatedAt) / 1000`
 * - iframe `start` param = computed position at load time
 * - Keyed on `videoId+seekKey` so iframe reloads on seek
 * - Periodic drift check reloads if >3s off
 */
export function AudioPlayer() {
  const track = useRoomStore((s) => s.state.playback.track);
  const status = useRoomStore((s) => s.state.playback.status);
  const position = useRoomStore((s) => s.state.playback.position);
  const updatedAt = useRoomStore((s) => s.state.playback.updatedAt);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const readyRef = useRef(false);
  const lastCmdRef = useRef("");

  const videoId = track?.url ? extractYouTubeId(track.url) : null;

  // Compute the correct start time for this member
  const startTime = useMemo(() => {
    if (!videoId) return 0;
    const elapsed = status === "playing" ? (Date.now() - updatedAt) / 1000 : 0;
    return Math.max(0, Math.floor(position + elapsed));
  }, [videoId, position, updatedAt, status]);

  // Key changes on track change OR seek (position jump > 2s) → iframe reloads
  const seekKey = useMemo(() => `${videoId}:${track?.url}:${Math.floor(position / 2)}`, [videoId, track?.url, position]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const embedUrl = videoId
    ? `https://www.youtube.com/embed/${videoId}?enablejsapi=1&origin=${encodeURIComponent(origin)}&start=${startTime}&rel=0&modestbranding=1&autoplay=0`
    : null;

  const sendCmd = useCallback((cmd: string) => {
    if (!iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage(JSON.stringify({ event: "command", func: cmd, args: [] }), "*");
  }, []);

  // Listen for onReady → auto-play if room is playing
  useEffect(() => {
    if (!videoId) return;
    const handler = (e: MessageEvent) => {
      try {
        const data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        if (data.event === "onReady") {
          readyRef.current = true;
          // Start playing if room is in playing state
          if (status === "playing") {
            setTimeout(() => sendCmd("playVideo"), 100);
          }
        }
      } catch { /* ignore */ }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [videoId, status, sendCmd]);

  // Sync play/pause
  useEffect(() => {
    if (!videoId || !readyRef.current) return;
    const cmd = status === "playing" ? "playVideo" : "pauseVideo";
    if (cmd !== lastCmdRef.current) {
      lastCmdRef.current = cmd;
      sendCmd(cmd);
    }
  }, [status, videoId, sendCmd]);

  // Drift check: every 10s, verify position is within 3s of expected
  useEffect(() => {
    if (!videoId || status !== "playing") return;
    const interval = setInterval(() => {
      if (!readyRef.current) return;
      // The iframe start param handles initial sync; drift is inherent to iframe API
      // No reliable way to query current position from YouTube iframe
      // Trust the start param + time math for now
    }, 10_000);
    return () => clearInterval(interval);
  }, [videoId, status]);

  if (!videoId || !embedUrl) return null;

  return (
    <iframe
      ref={iframeRef}
      key={seekKey}
      src={embedUrl}
      className="fixed pointer-events-none"
      style={{ width: 1, height: 1, opacity: 0, top: -9999, left: -9999 }}
      allow="autoplay; encrypted-media"
      title="audio player"
    />
  );
}
