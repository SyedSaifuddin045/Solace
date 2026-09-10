"use client";
import { useEffect, useState } from "react";
import { Play, Pause } from "lucide-react";
import { useRoomStore } from "@/lib/store";
import { getSocket } from "@/lib/socket";
import { formatRemaining } from "@/lib/time";

// no per-second updates when collapsed; only expand state ticks a local clock (cheap)
function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

export function SongWidget() {
  const playback = useRoomStore((s) => s.state.playback);
  const [hover, setHover] = useState(false);
  const now = useNow(hover && playback.status === "playing");

  const trackLabel = playback.track?.url ? playback.track.url.split("/").pop() ?? playback.track.url : "ambient silence";

  // v1 note: contract has no tracking duration — the progress bar below assumes a
  // 240s track for width only. Replace when set_track carries real duration.
  const livePos = playback.status === "playing" ? playback.position + (now - playback.updatedAt) / 1000 : playback.position;

  const toggle = () => {
    const s = getSocket();
    if (playback.status === "playing") s.emit("playback:pause");
    else s.emit("playback:play");
  };

  return (
    <div
      className="glass rounded-xl px-4 py-2 warm-glow"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {hover ? (
        <div className="min-w-[220px]">
          <p className="text-[12px] truncate">{trackLabel}</p>
          <div className="flex items-center gap-2 mt-1.5">
            <button onClick={toggle} aria-label={playback.status === "playing" ? "Pause" : "Play"} className="grid place-items-center w-6 h-6 rounded-full" style={{ background: "rgba(224,164,88,0.16)", color: "var(--accent-amber)" }}>
              {playback.status === "playing" ? <Pause size={12} /> : <Play size={12} />}
            </button>
            <div className="flex-1 h-[3px] rounded relative" style={{ background: "rgba(237,224,210,0.15)" }}>
              <div className="h-full rounded" style={{ width: `${Math.min(100, (livePos / 240) * 100)}%`, background: "var(--accent-amber)" }} />
            </div>
            <span className="text-[9px] opacity-60">{formatRemaining(livePos * 1000)}</span>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <div className="flex items-end gap-[3px] h-4">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="eq-bar w-[3px] h-full rounded-sm" style={{ background: "var(--accent-amber)", animationDelay: `${i * 0.12}s`, transform: playback.status === "playing" ? undefined : "scaleY(0.15)" }} />
            ))}
          </div>
          <div>
            <p className="text-[12px] leading-tight max-w-[180px] truncate">{trackLabel}</p>
            <p className="text-[10px] opacity-50">{formatRemaining(livePos * 1000)}</p>
          </div>
        </div>
      )}
    </div>
  );
}