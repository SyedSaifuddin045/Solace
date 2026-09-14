"use client";
import { useEffect, useRef, useCallback, useState } from "react";
import { useRoomStore } from "@/lib/store";
import { Music, Maximize2, Minimize2 } from "lucide-react";

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

export function VideoPlayer() {
  const track = useRoomStore((s) => s.state.playback.track);
  const status = useRoomStore((s) => s.state.playback.status);
  const position = useRoomStore((s) => s.state.playback.position);
  const updatedAt = useRoomStore((s) => s.state.playback.updatedAt);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [ready, setReady] = useState(false);
  const lastCommandRef = useRef<string>("");

  const videoId = track?.url ? extractYouTubeId(track.url) : null;
  const isYouTube = !!videoId;

  // Build embed URL with start time
  const embedUrl = videoId
    ? `https://www.youtube.com/embed/${videoId}?enablejsapi=1&origin=${typeof window !== "undefined" ? window.location.origin : ""}&start=${Math.floor(position)}&rel=0&modestbranding=1`
    : null;

  // Send postMessage command to YouTube iframe
  const sendCommand = useCallback((command: string, args?: unknown[]) => {
    if (!iframeRef.current?.contentWindow) return;
    const msg = { event: "command", func: command, args: args || [] };
    iframeRef.current.contentWindow.postMessage(JSON.stringify(msg), "*");
  }, []);

  // Listen for YouTube player state changes
  useEffect(() => {
    if (!isYouTube) return;

    const handler = (e: MessageEvent) => {
      try {
        const data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        if (data.event === "onReady") {
          setReady(true);
        }
      } catch {
        // ignore
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [isYouTube]);

  // Sync play/pause with store state
  useEffect(() => {
    if (!isYouTube || !ready) return;

    const cmd = status === "playing" ? "playVideo" : "pauseVideo";
    if (cmd !== lastCommandRef.current) {
      lastCommandRef.current = cmd;
      sendCommand(cmd);
    }
  }, [status, isYouTube, ready, sendCommand]);

  if (!isYouTube || !embedUrl) return null;

  return (
    <div
      className={`transition-all duration-300 ${
        expanded
          ? "fixed inset-0 z-50 bg-black grid place-items-center"
          : "relative w-full aspect-video rounded-xl overflow-hidden"
      }`}
    >
      <iframe
        ref={iframeRef}
        src={embedUrl}
        className={expanded ? "w-full h-full max-w-5xl" : "w-full h-full"}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        title={track?.title || "YouTube video"}
      />

      {/* Expand/collapse toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="absolute top-2 right-2 rounded-md p-1.5 z-10"
        style={{ background: "rgba(20,17,15,0.7)", color: "var(--accent-amber)" }}
        aria-label={expanded ? "Minimize" : "Maximize"}
      >
        {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
      </button>

      {/* Now playing overlay */}
      {expanded && (
        <div className="absolute bottom-4 left-4 flex items-center gap-2 glass rounded-lg px-3 py-1.5">
          <Music size={12} style={{ color: "var(--accent-amber)" }} />
          <span className="text-[11px]">{track?.title || "playing"}</span>
        </div>
      )}
    </div>
  );
}
