"use client";
import { useEffect, useState } from "react";
import { Play, Pause, Music } from "lucide-react";
import { useRoomStore } from "@/lib/store";
import { getSocket } from "@/lib/socket";
import { formatRemaining } from "@/lib/time";

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

export function SongWidget({ onOpenPicker }: { onOpenPicker?: () => void }) {
  const track = useRoomStore((s) => s.state.playback.track);
  const status = useRoomStore((s) => s.state.playback.status);
  const position = useRoomStore((s) => s.state.playback.position);
  const updatedAt = useRoomStore((s) => s.state.playback.updatedAt);
  const [hover, setHover] = useState(false);
  const now = useNow(hover && status === "playing");

  const livePos = status === "playing" ? position + (now - updatedAt) / 1000 : position;
  const duration = track?.duration || 0;
  const progress = duration > 0 ? Math.min(100, (livePos / duration) * 100) : 0;

  const displayTitle = track?.title || track?.url?.split("/").pop() || "ambient silence";
  const displayArtist = track?.artist || "";

  const toggle = () => {
    const s = getSocket();
    if (status === "playing") s.emit("playback:pause");
    else s.emit("playback:play");
  };

  return (
    <div
      className="glass rounded-xl px-4 py-2 warm-glow max-w-xs w-full sm:w-auto"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {hover ? (
        <div className="min-w-[220px]">
          <div className="flex items-center gap-2.5 mb-2">
            {/* Artwork */}
            {track?.artwork ? (
              <img src={track.artwork} alt="" className="w-10 h-10 rounded-md object-cover shrink-0" />
            ) : (
              <div className="w-10 h-10 rounded-md grid place-items-center shrink-0" style={{ background: "var(--depth-3)" }}>
                <Music size={14} className="opacity-40" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-[12px] truncate leading-tight">{displayTitle}</p>
              {displayArtist && <p className="text-[10px] opacity-50 truncate">{displayArtist}</p>}
            </div>
          </div>

          {/* Progress */}
          <div className="flex items-center gap-2">
            <button onClick={toggle} aria-label={status === "playing" ? "Pause" : "Play"} className="grid place-items-center w-6 h-6 rounded-full shrink-0" style={{ background: "rgba(224,164,88,0.16)", color: "var(--accent-amber)" }}>
              {status === "playing" ? <Pause size={12} /> : <Play size={12} />}
            </button>
            <div className="flex-1 h-[3px] rounded relative" style={{ background: "rgba(237,224,210,0.15)" }}>
              <div className="h-full rounded" style={{ width: `${progress}%`, background: "var(--accent-amber)" }} />
            </div>
            <span className="text-[9px] opacity-60 tabular-nums">
              {duration > 0 ? `${formatRemaining(livePos * 1000)}` : "0:00"}
            </span>
          </div>

          {/* Change track */}
          {onOpenPicker && (
            <button
              onClick={onOpenPicker}
              className="mt-2 text-[9px] opacity-40 hover:opacity-70 transition-opacity"
              style={{ color: "var(--accent-amber)" }}
            >
              change track
            </button>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-3">
          {/* Eq bars or artwork */}
          {track?.artwork ? (
            <img src={track.artwork} alt="" className="w-8 h-8 rounded-sm object-cover shrink-0" />
          ) : (
            <div className="flex items-end gap-[3px] h-4">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className="eq-bar w-[3px] h-full rounded-sm" style={{ background: "var(--accent-amber)", animationDelay: `${i * 0.12}s`, transform: status === "playing" ? undefined : "scaleY(0.15)" }} />
              ))}
            </div>
          )}
          <div>
            <p className="text-[12px] leading-tight max-w-[180px] truncate">{displayTitle}</p>
            <p className="text-[10px] opacity-50">{duration > 0 ? formatRemaining(livePos * 1000) : ""}</p>
          </div>
        </div>
      )}
    </div>
  );
}
