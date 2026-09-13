"use client";
import { useState } from "react";
import { X, Search, Music, Loader2 } from "lucide-react";
import { useRoomStore } from "@/lib/store";
import { getSocket } from "@/lib/socket";
import { resolveTrack } from "@/lib/track";
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
      pushToast((e as Error).message, "err");
    } finally {
      setResolving(false);
    }
  };

  const handleSetTrack = () => {
    if (!preview) return;
    getSocket().emit("playback:set_track", { track: preview });
    onClose();
  };

  const handleClearTrack = () => {
    getSocket().emit("playback:set_track", { track: null });
    onClose();
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
        <div className="flex items-center justify-between mb-4">
          <p className="text-[12px]" style={{ color: "var(--accent-rose)" }}>set track</p>
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
            className="rounded-lg px-3 py-2 text-[11px] flex items-center gap-1 disabled:opacity-50"
            style={{ background: "rgba(224,164,88,0.16)", color: "var(--accent-amber)" }}
          >
            {resolving ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
            resolve
          </button>
        </div>

        {/* Preview */}
        {preview && (
          <div
            className="rounded-lg p-3 mb-4 flex items-center gap-3"
            style={{ background: "var(--depth-2)", border: "1px solid rgba(237,224,210,0.1)" }}
          >
            {preview.artwork ? (
              <img src={preview.artwork} alt="" className="w-12 h-12 rounded-md object-cover" />
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
            className="rounded-lg p-4 mb-4 text-center"
            style={{ background: "var(--depth-2)", border: "1px solid rgba(237,224,210,0.1)" }}
          >
            <p className="text-[11px] opacity-40">no track set — paste a link above</p>
          </div>
        )}

        {/* Current track info */}
        {!preview && track && (
          <div
            className="rounded-lg p-3 mb-4 flex items-center gap-3"
            style={{ background: "var(--depth-2)", border: "1px solid rgba(237,224,210,0.1)" }}
          >
            {track.artwork ? (
              <img src={track.artwork} alt="" className="w-10 h-10 rounded-md object-cover" />
            ) : (
              <div className="w-10 h-10 rounded-md grid place-items-center" style={{ background: "var(--depth-3)" }}>
                <Music size={14} className="opacity-40" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-[11px] truncate">{track.title || track.url.split("/").pop() || "current track"}</p>
              <p className="text-[9px] opacity-40">currently set</p>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={handleSetTrack}
            disabled={!preview}
            className="flex-1 rounded-full px-4 py-2 text-[11px] font-medium disabled:opacity-50"
            style={{ background: "var(--accent-amber)", color: "#14110F" }}
          >
            set track
          </button>
          {track && (
            <button
              onClick={handleClearTrack}
              className="rounded-full px-4 py-2 text-[11px]"
              style={{ background: "rgba(201,124,110,0.16)", color: "var(--accent-rose)" }}
            >
              clear
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
