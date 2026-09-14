"use client";
import { useEffect, useRef, useCallback } from "react";
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

/** Hidden iframe that plays YouTube audio only. No visible UI. */
export function AudioPlayer() {
  const track = useRoomStore((s) => s.state.playback.track);
  const status = useRoomStore((s) => s.state.playback.status);
  const position = useRoomStore((s) => s.state.playback.position);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const readyRef = useRef(false);
  const lastCmdRef = useRef("");

  const videoId = track?.url ? extractYouTubeId(track.url) : null;

  const embedUrl = videoId
    ? `https://www.youtube.com/embed/${videoId}?enablejsapi=1&origin=${typeof window !== "undefined" ? window.location.origin : ""}&start=${Math.floor(position)}&rel=0&modestbranding=1&autoplay=0`
    : null;

  const sendCmd = useCallback((cmd: string) => {
    if (!iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage(JSON.stringify({ event: "command", func: cmd, args: [] }), "*");
  }, []);

  // Listen for onReady
  useEffect(() => {
    if (!videoId) return;
    const handler = (e: MessageEvent) => {
      try {
        const data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        if (data.event === "onReady") readyRef.current = true;
      } catch { /* ignore */ }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [videoId]);

  // Sync play/pause
  useEffect(() => {
    if (!videoId || !readyRef.current) return;
    const cmd = status === "playing" ? "playVideo" : "pauseVideo";
    if (cmd !== lastCmdRef.current) {
      lastCmdRef.current = cmd;
      sendCmd(cmd);
    }
  }, [status, videoId, sendCmd]);

  if (!videoId || !embedUrl) return null;

  return (
    <iframe
      ref={iframeRef}
      src={embedUrl}
      className="fixed pointer-events-none"
      style={{ width: 1, height: 1, opacity: 0, top: -9999, left: -9999 }}
      allow="autoplay; encrypted-media"
      title="audio player"
    />
  );
}
