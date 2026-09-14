"use client";
import { useEffect, useState } from "react";
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
 * Audio-only YouTube player synced across room members.
 *
 * Play/pause by mounting/unmounting the iframe.
 * - Play: mount iframe with autoplay=1&start=N
 * - Pause: unmount iframe (stops audio)
 * - Seek: unmount + remount with new start time
 *
 * User gesture required before first mount (browser autoplay policy).
 */
export function AudioPlayer() {
  const track = useRoomStore((s) => s.state.playback.track);
  const status = useRoomStore((s) => s.state.playback.status);
  const position = useRoomStore((s) => s.state.playback.position);
  const updatedAt = useRoomStore((s) => s.state.playback.updatedAt);
  const [armed, setArmed] = useState(false);

  const videoId = track?.url ? extractYouTubeId(track.url) : null;
  const isYouTube = !!videoId;
  const isPlaying = status === "playing";

  // Arm on first user interaction
  useEffect(() => {
    if (armed || !isYouTube) return;
    const arm = () => setArmed(true);
    window.addEventListener("click", arm, { once: true });
    window.addEventListener("keydown", arm, { once: true });
    return () => {
      window.removeEventListener("click", arm);
      window.removeEventListener("keydown", arm);
    };
  }, [isYouTube, armed]);

  // Don't render until user clicks
  if (!armed || !isYouTube || !videoId) return null;

  // Don't mount iframe if paused
  if (!isPlaying) return null;

  // Compute start time for sync
  const elapsed = (Date.now() - updatedAt) / 1000;
  const startTime = Math.max(0, Math.floor(position + elapsed));

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  // Key on videoId + startTime → reloads iframe on seek or track change
  const iframeKey = `${videoId}:${startTime}`;
  const src = `https://www.youtube.com/embed/${videoId}?autoplay=1&enablejsapi=1&origin=${encodeURIComponent(origin)}&start=${startTime}&rel=0&modestbranding=1`;

  return (
    <div className="fixed" style={{ width: 1, height: 1, top: -9999, left: -9999 }}>
      <iframe
        key={iframeKey}
        src={src}
        style={{ width: 0, height: 0, border: 0 }}
        allow="autoplay; encrypted-media"
        title="audio"
      />
    </div>
  );
}
