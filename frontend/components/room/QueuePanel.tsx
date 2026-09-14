"use client";
import { X, Music, Trash2, List } from "lucide-react";
import { useRoomStore } from "@/lib/store";
import { getSocket } from "@/lib/socket";

export function QueuePanel({ onClose }: { onClose: () => void }) {
  const queue = useRoomStore((s) => s.state.queue);

  const removeTrack = (index: number) => {
    getSocket().emit("playback:queue_remove", { index });
  };

  const clearQueue = () => {
    getSocket().emit("playback:queue_clear");
  };

  return (
    <div className="glass rounded-2xl p-4 max-w-sm w-full max-h-[70vh] flex flex-col" style={{ minWidth: 280 }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <List size={14} style={{ color: "var(--accent-amber)" }} />
          <p className="text-[12px] font-medium" style={{ color: "var(--accent-amber)" }}>
            queue
          </p>
          <span className="text-[10px] opacity-40">({queue.length}/20)</span>
        </div>
        <div className="flex items-center gap-2">
          {queue.length > 0 && (
            <button
              onClick={clearQueue}
              className="text-[10px] opacity-40 hover:opacity-70 transition-opacity"
              style={{ color: "var(--accent-rose)" }}
            >
              clear all
            </button>
          )}
          <button aria-label="Close" onClick={onClose}>
            <X size={14} className="opacity-60" />
          </button>
        </div>
      </div>

      {/* Queue List */}
      <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
        {queue.length === 0 ? (
          <div className="rounded-lg p-6 text-center" style={{ background: "var(--depth-2)" }}>
            <p className="text-[11px] opacity-40">queue empty</p>
            <p className="text-[9px] opacity-30 mt-1">paste a link in the track picker</p>
          </div>
        ) : (
          queue.map((track, i) => (
            <div
              key={`${track.url}-${i}`}
              className="rounded-lg p-2.5 flex items-center gap-2.5 group"
              style={{ background: "var(--depth-2)", border: "1px solid rgba(237,224,210,0.08)" }}
            >
              {track.artwork ? (
                <img src={track.artwork} alt="" referrerPolicy="no-referrer" className="w-8 h-8 rounded-md object-cover shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded-md grid place-items-center shrink-0" style={{ background: "var(--depth-3)" }}>
                  <Music size={12} className="opacity-40" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[11px] truncate">{track.title || "Unknown"}</p>
                <p className="text-[9px] opacity-40 truncate">{track.artist || ""}</p>
              </div>
              <button
                onClick={() => removeTrack(i)}
                className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity p-1"
                style={{ color: "var(--accent-rose)" }}
                aria-label="Remove from queue"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
