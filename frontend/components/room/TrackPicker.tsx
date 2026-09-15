"use client";
import { useState } from "react";
import { X, Search, Music, Loader2, Play, ListPlus, Trash2 } from "lucide-react";
import { useRoomStore } from "@/lib/store";
import { getSocket } from "@/lib/socket";
import { resolveTrack, ResolveError } from "@/lib/track";
import { extractYouTubeId } from "@/lib/youtube";
import { pushToast } from "@/components/room/ToastStack";

export function TrackPicker({ onClose }: { onClose: () => void }) {
  const track = useRoomStore((s) => s.state.playback.track);
  const [url, setUrl] = useState("");
  const [resolving, setResolving] = useState(false);
  const [preview, setPreview] = useState<{
    url: string;
    title?: string;
    artist?: string;
    artwork?: string;
    duration?: number;
    provider?: string;
    embeddable?: boolean;
    playMode?: "stream" | "embed";
  } | null>(null);

  const handleResolve = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setResolving(true);
    setPreview(null);
    try {
      const result = await resolveTrack(trimmed);
      setPreview(result);
    } catch (e) {
      if (e instanceof ResolveError && e.embeddable && extractYouTubeId(trimmed)) {
        // Stream extraction blocked (datacenter bot-wall) but the video is
        // embeddable — fall back to the hidden YouTube embed (Option B).
        const m = e.metadata || {};
        setPreview({
          url: trimmed,
          title: m.title || "YouTube video (embed fallback)",
          artist: m.artist,
          artwork: m.artwork,
          provider: "youtube",
          embeddable: true,
          playMode: "embed",
        });
        pushToast("stream blocked — using embed fallback", "ok");
      } else {
        pushToast((e as Error).message, "err");
      }
    } finally {
      setResolving(false);
    }
  };

  const handleSetTrack = () => {
    if (!preview) return;
    getSocket().emit("playback:play", { track: preview });
    onClose();
  };

  const handleClearTrack = () => {
    getSocket().emit("playback:set_track", { track: null });
    onClose();
  };

  const handleAddToQueue = () => {
    if (!preview) return;
    getSocket().emit("playback:queue_add", { track: preview });
    pushToast("added to queue", "ok");
    setPreview(null);
    setUrl("");
  };

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="fixed inset-0 z-30 grid place-items-center" style={{ background: "rgba(20,17,15,0.85)" }}>
      <div className="glass rounded-2xl px-6 py-5 max-w-md w-full mx-4 warm-glow">
        {/* Header */}
        <div className="flex items-center justify-end mb-4">
          <button aria-label="Close" onClick={onClose}><X size={14} className="opacity-60" /></button>
        </div>

        {/* URL Input */}
        <div className="flex gap-2 mb-4">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleResolve()}
            placeholder="paste a YouTube or SoundCloud link"
            className="hairline rounded-lg px-3 py-2 text-[12px] flex-1 outline-none"
            style={{ background: "rgba(20,17,15,0.4)" }}
          />
          <button
            onClick={handleResolve}
            disabled={resolving || !url.trim()}
            className="rounded-lg w-9 h-9 grid place-items-center disabled:opacity-50"
            style={{ background: "rgba(224,164,88,0.16)", color: "var(--accent-amber)" }}
          >
            {resolving ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          </button>
        </div>

        {/* Preview */}
        {preview && (
          <div
            className="rounded-lg p-3 mb-4 flex items-center gap-3"
            style={{ background: "var(--depth-2)", border: "1px solid rgba(237,224,210,0.1)" }}
          >
            {preview.artwork ? (
              <img src={preview.artwork} alt="" referrerPolicy="no-referrer" className="w-12 h-12 rounded-md object-cover" />
            ) : (
              <div className="w-12 h-12 rounded-md grid place-items-center" style={{ background: "var(--depth-3)" }}>
                <Music size={16} className="opacity-40" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-[12px] truncate">{preview.title || "Unknown title"}</p>
              <p className="text-[10px] opacity-50 truncate">
                {preview.artist || "Unknown artist"}
                {preview.duration ? ` · ${formatDuration(preview.duration)}` : ""}
                {preview.provider ? ` · ${preview.provider}` : ""}
              </p>
            </div>
          </div>
        )}

        {/* No track placeholder */}
        {!preview && !track && (
          <div
            className="rounded-lg p-4 mb-4 grid place-items-center"
            style={{ background: "var(--depth-2)", border: "1px solid rgba(237,224,210,0.1)" }}
          >
            <Music size={16} className="opacity-20" />
          </div>
        )}

        {/* Current track info */}
        {!preview && track && (
          <div
            className="rounded-lg p-3 mb-4 flex items-center gap-3"
            style={{ background: "var(--depth-2)", border: "1px solid rgba(237,224,210,0.1)" }}
          >
            {track.artwork ? (
              <img src={track.artwork} alt="" referrerPolicy="no-referrer" className="w-10 h-10 rounded-md object-cover" />
            ) : (
              <div className="w-10 h-10 rounded-md grid place-items-center" style={{ background: "var(--depth-3)" }}>
                <Music size={14} className="opacity-40" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-[11px] truncate">{track.title || track.url.split("/").pop() || "current track"}</p>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 justify-center">
          <button
            onClick={handleSetTrack}
            disabled={!preview}
            className="rounded-full w-9 h-9 grid place-items-center disabled:opacity-50"
            style={{ background: "var(--accent-amber)", color: "#14110F" }}
            title="Play now"
          >
            <Play size={14} />
          </button>
          <button
            onClick={handleAddToQueue}
            disabled={!preview}
            className="rounded-full w-9 h-9 grid place-items-center disabled:opacity-50"
            style={{ background: "rgba(224,164,88,0.16)", color: "var(--accent-amber)" }}
            title="Add to queue"
          >
            <ListPlus size={14} />
          </button>
          {track && (
            <button
              onClick={handleClearTrack}
              className="rounded-full w-9 h-9 grid place-items-center"
              style={{ background: "rgba(201,124,110,0.16)", color: "var(--accent-rose)" }}
              title="Clear track"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
