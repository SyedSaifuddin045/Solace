"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { Play, Pause, Music, SkipForward, Volume2, VolumeX } from "lucide-react";
import { useRoomStore } from "@/lib/store";
import { getSocket } from "@/lib/socket";
import { formatRemaining } from "@/lib/time";
import { loadVolume, saveVolume } from "@/lib/volume";
import { getPlaybackEngine } from "@/components/room/VideoPlayer";
import { MarqueeText } from "@/components/room/MarqueeText";

function useAudioProgress(status: string) {
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);

  useEffect(() => {
    if (status !== "playing") return;
    const id = setInterval(() => {
      try {
        const engine = getPlaybackEngine();
        if (engine) {
          setPos(engine.currentTime);
          setDur(engine.duration || 0);
        }
      } catch {
        // A broken engine (e.g. a degraded YT embed) must never spam the
        // console every 250ms or take down the widget.
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

  // Personal volume — local client preference, never broadcast to the room.
  const [volume, setVolumeState] = useState<number>(() => loadVolume());
  const lastVolumeRef = useRef<number>(volume > 0 ? volume : 1);

  const applyVolume = (v: number) => {
    const clamped = Math.min(1, Math.max(0, v));
    if (clamped > 0) lastVolumeRef.current = clamped;
    getPlaybackEngine()?.setVolume(clamped);
    saveVolume(clamped);
    setVolumeState(clamped);
  };

  // Re-apply persisted volume when a new engine appears (track change) —
  // slider drags only happen while the widget exists, but a fresh track
  // remounts the engine with a fresh default.
  useEffect(() => {
    getPlaybackEngine()?.setVolume(volume);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volume, track?.url]);

  const toggleMute = () => {
    applyVolume(volume > 0 ? 0 : lastVolumeRef.current);
  };

  const duration = liveDur || track?.duration || 0;
  const progress = duration > 0 ? Math.min(100, (livePos / duration) * 100) : 0;

  const displayTitle = track?.title || track?.url?.split("/").pop() || "ambient silence";
  const displayArtist = track?.artist || "";

  const toggle = () => {
    const s = getSocket();
    if (status === "playing") {
      const engine = getPlaybackEngine();
      const pos = engine ? engine.currentTime : 0;
      s.emit("playback:pause", { position: pos });
    } else {
      // Resume within the user gesture: the server ack arrives AFTER the
      // gesture expires, so the effect-side play() would be autoplay-blocked.
      // Starting the already-loaded element synchronously keeps sound on.
      const engine = getPlaybackEngine();
      if (engine && engine.currentSrc) {
        engine.muted = false;
        engine.play();
      }
      s.emit("playback:play");
    }
  };

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || !duration) return;
    const rect = progressRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const seekTo = ratio * duration;
    const engine = getPlaybackEngine();
    if (engine) engine.seekTo(seekTo);
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
              <img src={track.artwork} alt="" referrerPolicy="no-referrer" className="w-10 h-10 rounded-md object-cover shrink-0" />
            ) : (
              <div className="w-10 h-10 rounded-md grid place-items-center shrink-0" style={{ background: "var(--depth-3)" }}>
                <Music size={14} className="opacity-40" />
              </div>
            )}
            <div className="min-w-0">
              <MarqueeText text={displayTitle} className="text-[12px] truncate leading-tight" />
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
            <button onClick={toggleMute} aria-label={volume > 0 ? "Mute" : "Unmute"} title={volume > 0 ? "Mute" : "Unmute"} className="grid place-items-center w-6 h-6 rounded-full shrink-0" style={{ color: "var(--accent-amber)", opacity: 0.8 }}>
              {volume > 0 ? <Volume2 size={12} /> : <VolumeX size={12} />}
            </button>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(volume * 100)}
              onChange={(e) => applyVolume(Number(e.target.value) / 100)}
              aria-label="Volume"
              className="w-16 h-[3px] cursor-pointer shrink-0"
              style={{ accentColor: "var(--accent-amber)" }}
            />
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
            <img src={track.artwork} alt="" referrerPolicy="no-referrer" className="w-8 h-8 rounded-sm object-cover shrink-0" />
          ) : (
            <div className="flex items-end gap-[3px] h-4">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className="eq-bar w-[3px] h-full rounded-sm" style={{ background: "var(--accent-amber)", animationDelay: `${i * 0.12}s`, transform: status === "playing" ? undefined : "scaleY(0.15)" }} />
              ))}
            </div>
          )}
          <div>
            <MarqueeText text={displayTitle} className="text-[12px] leading-tight max-w-[180px] truncate" />
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
