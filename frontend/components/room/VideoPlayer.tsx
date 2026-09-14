"use client";
import { useEffect, useRef, useCallback, useMemo, useState } from "react";
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
 * Sync: server broadcasts { position, updatedAt } → members compute
 * currentPos = position + (Date.now() - updatedAt) / 1000 → iframe start param.
 *
 * Autoplay: browser blocks audio without user gesture. We arm a click listener
 * after mount; first click triggers playVideo via postMessage.
 */
export function AudioPlayer() {
  const track = useRoomStore((s) => s.state.playback.track);
  const status = useRoomStore((s) => s.state.playback.status);
  const position = useRoomStore((s) => s.state.playback.position);
  const updatedAt = useRoomStore((s) => s.state.playback.updatedAt);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const readyRef = useRef(false);
  const lastCmdRef = useRef("");
  const [userInteracted, setUserInteracted] = useState(false);

  const videoId = track?.url ? extractYouTubeId(track.url) : null;

  // Compute correct start time
  const startTime = useMemo(() => {
    if (!videoId) return 0;
    const elapsed = status === "playing" ? (Date.now() - updatedAt) / 1000 : 0;
    return Math.max(0, Math.floor(position + elapsed));
  }, [videoId, position, updatedAt, status]);

  // Key on track + position for reload on seek
  const seekKey = `${videoId}:${track?.url}:${Math.floor(position / 2)}`;

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const embedUrl = videoId
    ? `https://www.youtube.com/embed/${videoId}?enablejsapi=1&origin=${encodeURIComponent(origin)}&start=${startTime}&rel=0&modestbranding=1&autoplay=0`
    : null;

  const sendCmd = useCallback((cmd: string) => {
    if (!iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage(JSON.stringify({ event: "command", func: cmd, args: [] }), "*");
  }, []);

  // Arm click listener — first user click unlocks audio
  useEffect(() => {
    if (userInteracted || !videoId) return;
    const unlock = () => {
      setUserInteracted(true);
      // Try to play on first interaction
      if (readyRef.current && status === "playing") {
        setTimeout(() => sendCmd("playVideo"), 100);
      }
    };
    window.addEventListener("click", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("click", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [videoId, status, sendCmd, userInteracted]);

  // Listen for onReady
  useEffect(() => {
    if (!videoId) return;
    const handler = (e: MessageEvent) => {
      try {
        const data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        if (data.event === "onReady") {
          readyRef.current = true;
          console.debug("[solace:FE] YouTube iframe ready");
          // Play if user has interacted and room is playing
          if (userInteracted && status === "playing") {
            setTimeout(() => sendCmd("playVideo"), 100);
          }
        }
      } catch { /* ignore */ }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [videoId, status, sendCmd, userInteracted]);

  // Sync play/pause
  useEffect(() => {
    if (!videoId || !readyRef.current || !userInteracted) return;
    const cmd = status === "playing" ? "playVideo" : "pauseVideo";
    if (cmd !== lastCmdRef.current) {
      lastCmdRef.current = cmd;
      sendCmd(cmd);
      console.debug("[solace:FE] YouTube sendCmd", cmd);
    }
  }, [status, videoId, sendCmd, userInteracted]);

  // Retry play if first attempt fails (YouTube sometimes needs a second try)
  useEffect(() => {
    if (!videoId || !userInteracted || status !== "playing") return;
    const retry = setTimeout(() => {
      if (readyRef.current && lastCmdRef.current !== "playVideo") {
        sendCmd("playVideo");
      }
    }, 1000);
    return () => clearTimeout(retry);
  }, [videoId, userInteracted, status, sendCmd]);

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
