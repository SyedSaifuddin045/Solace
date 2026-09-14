"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { Play, Pause, Music, SkipForward } from "lucide-react";
import { useRoomStore } from "@/lib/store";
import { getSocket } from "@/lib/socket";
import { formatRemaining } from "@/lib/time";
import { getAudioElement } from "@/components/room/VideoPlayer";

function useAudioProgress(status: string) {
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);

  useEffect(() => {
    if (status !== "playing") return;
    const id = setInterval(() => {
      const audio = getAudioElement();
      if (audio) {
        setPos(audio.currentTime);
        setDur(audio.duration || 0);
      }
    }, 250);
    return () => clearInterval(id);
  }, [status]);

  return { pos, dur };
}

export function SongWidget({ onOpenPicker, onOpenQueue }: { onOpenPicker?: () => void; onOpenQueue?: () => void }) {
  const track = useRoomStore((s) => s.state.playback.track);
  const status = useRoomStore((s) => s.state.playback.status);
  const queue = useRoomStore((s) => s.state.queue);
  const [hover, setHover] = useState(false);
  const { pos: livePos, dur: liveDur } = useAudioProgress(status);
  const progressRef = useRef<HTMLDivElement>(null);

  const duration = liveDur || track?.duration || 0;
  const progress = duration > 0 ? Math.min(100, (livePos / duration) * 100) : 0;

  const displayTitle = track?.title || track?.url?.split("/").pop() || "ambient silence";
  const displayArtist = track?.artist || "";

  const toggle = () => {
    const s = getSocket();
    if (status === "playing") {
      const audio = getAudioElement();
      const pos = audio ? audio.currentTime : 0;
      s.emit("playback:pause", { position: pos });
    } else {
      s.emit("playback:play");
    }
  };

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || !duration) return;
    const rect = progressRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const seekTo = ratio * duration;
    const audio = getAudioElement();
    if (audio) audio.currentTime = seekTo;
    getSocket().emit("playback:seek", { position: seekTo });
  }, [duration]);

  return (
    <div
      className="glass rounded-xl px-4 py-2 warm-glow max-w-xs w-full sm:w-auto"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {hover ? (
        <div className="min-w-[220px]">
          <div className="flex items-center gap-2.5 mb-2">
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

          {/* Progress — clickable for seek */}
          <div className="flex items-center gap-2">
            <button onClick={toggle} aria-label={status === "playing" ? "Pause" : "Play"} className="grid place-items-center w-6 h-6 rounded-full shrink-0" style={{ background: "rgba(224,164,88,0.16)", color: "var(--accent-amber)" }}>
              {status === "playing" ? <Pause size={12} /> : <Play size={12} />}
            </button>
            <div
              ref={progressRef}
              onClick={handleSeek}
              className="flex-1 h-[3px] rounded relative cursor-pointer"
              style={{ background: "rgba(237,224,210,0.15)" }}
            >
              <div className="h-full rounded" style={{ width: `${progress}%`, background: "var(--accent-amber)" }} />
            </div>
            {queue.length > 0 && (
              <button onClick={() => getSocket().emit("playback:skip")} aria-label="Skip to next" title="Skip to next" className="grid place-items-center w-6 h-6 rounded-full shrink-0" style={{ background: "rgba(224,164,88,0.12)", color: "var(--accent-amber)" }}>
                <SkipForward size={12} />
              </button>
            )}
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
          {queue.length > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); getSocket().emit("playback:skip"); }}
              aria-label="Skip to next"
              className="rounded-full w-5 h-5 grid place-items-center shrink-0 transition-colors"
              style={{ color: "var(--accent-amber)", opacity: 0.6 }}
            >
              <SkipForward size={12} />
            </button>
          )}
          {queue.length > 0 && onOpenQueue && (
            <button
              onClick={(e) => { e.stopPropagation(); onOpenQueue(); }}
              className="ml-auto rounded-full w-5 h-5 grid place-items-center text-[8px] font-bold shrink-0"
              style={{ background: "rgba(224,164,88,0.2)", color: "var(--accent-amber)" }}
            >
              {queue.length}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
