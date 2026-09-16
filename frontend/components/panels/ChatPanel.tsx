"use client";
import { useEffect, useRef, useState } from "react";
import { Send, X } from "lucide-react";
import { useRoomStore } from "@/lib/store";
import { getSocket } from "@/lib/socket";
import { activityPresentation } from "@/lib/activity";

const KIND_COLOR: Record<string, string> = {
  chat: "var(--accent-bone)",
  playback: "var(--accent-amber)",
  wallpaper: "var(--accent-rose)",
  title: "var(--accent-violet)",
  media: "var(--accent-violet)",
  timer: "var(--status-warning)",
  system: "var(--status-info)",
};

export function ChatPanel({ onClose }: { onClose: () => void }) {
  const activity = useRoomStore((s) => s.state.activity);
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  useEffect(() => {
    if (stickRef.current) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activity]);

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  };

  const send = () => {
    const text = draft.trim().slice(0, 500);
    if (!text) return;
    getSocket().emit("activity:send", { text });
    setDraft("");
  };

  return (
    <div className="p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[12px]" style={{ color: "var(--accent-violet)" }}>room stream</p>
        <button aria-label="Close" onClick={onClose}><X size={14} className="opacity-60" /></button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-1.5 pr-1" onScroll={onScroll}>
        {activity.map((a) => {
          const { kind } = activityPresentation(a.type);
          const color = KIND_COLOR[kind] ?? "var(--accent-bone)";
          return (
            <div key={a.id} className="rounded-md px-2 py-1 text-[11px]" style={{ background: "rgba(237,224,210,0.05)" }}>
              {kind === "chat" ? (
                <span><span className="opacity-80">{a.actor.displayName}:</span> <span>{a.detail}</span></span>
              ) : (
                <span style={{ color }}>
                  <span className="opacity-70">{a.actor.displayName}</span> · <span className="opacity-80 italic">{a.detail}</span>
                </span>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="mt-2 flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          maxLength={500}
          placeholder="say something…"
          className="hairline rounded-md px-3 py-1.5 text-[11px] flex-1 outline-none"
          style={{ background: "rgba(20,17,15,0.4)" }}
        />
        <button aria-label="Send" onClick={send} className="rounded-full p-2" style={{ background: "rgba(155,123,184,0.18)", color: "var(--accent-violet)" }}>
          <Send size={12} />
        </button>
      </div>
    </div>
  );
}