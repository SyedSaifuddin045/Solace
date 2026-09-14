"use client";
import { useState } from "react";
import { Mic, MicOff, Video, VideoOff, Settings, MessageSquare, Info, Image as ImageIcon, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRoomStore } from "@/lib/store";
import { getSocket } from "@/lib/socket";
import { startRtc, stopRtc } from "@/lib/rtc";

export type PanelKind = "chat" | "info" | "theme" | "wallpaper";

function IconBtn({ label, children, active, tint, onClick }: { label: string; children: React.ReactNode; active?: boolean; tint?: string; onClick: () => void }) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className="w-8 h-8 rounded-full grid place-items-center transition-colors"
      style={{
        background: active ? "rgba(224,164,88,0.18)" : "rgba(26,22,20,0.6)",
        color: tint ?? (active ? "var(--accent-amber)" : "var(--accent-bone)"),
      }}
    >
      {children}
    </button>
  );
}

export function MediaControls() {
  const audioOn = useRoomStore((s) => s.audioOnLocal);
  const videoOn = useRoomStore((s) => s.videoOnLocal);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const router = useRouter();

  const toggleMedia = (kind: "audio" | "video") => {
    const nextAudio = kind === "audio" ? !audioOn : audioOn;
    const nextVideo = kind === "video" ? !videoOn : videoOn;
    console.debug("[solace:FE] toggleMedia", { kind, audioOn, videoOn, nextAudio, nextVideo });
    void startRtc({ audio: nextAudio, video: nextVideo })
      .then(() => {
        console.debug("[solace:FE] startRtc resolved", { nextAudio, nextVideo });
      })
      .catch((err) => {
        console.debug("[solace:FE] startRtc rejected", {
          nextAudio,
          nextVideo,
          name: (err as DOMException)?.name,
          message: (err as DOMException)?.message,
        });
      });
  };

  const leave = () => {
    getSocket().emit("room:leave");
    console.debug("[solace:FE] leave room stopRtc", {});
    stopRtc();
    useRoomStore.getState().reset();
    router.replace("/");
  };

  return (
    <div className="relative">
      <div className="glass rounded-full p-1.5 flex items-center gap-1.5 warm-glow">
        <IconBtn label="Toggle mic" onClick={() => toggleMedia("audio")} tint={audioOn ? undefined : "var(--status-error)"} active={audioOn}>
          {audioOn ? <Mic size={14} strokeWidth={1.8} /> : <MicOff size={14} strokeWidth={1.8} />}
        </IconBtn>
        <IconBtn label="Toggle camera" onClick={() => toggleMedia("video")} tint={videoOn ? undefined : "var(--status-error)"} active={videoOn}>
          {videoOn ? <Video size={14} strokeWidth={1.8} /> : <VideoOff size={14} strokeWidth={1.8} />}
        </IconBtn>
        <button
          aria-label="Leave room"
          onClick={() => setConfirmLeave(true)}
          className="w-8 h-8 rounded-full grid place-items-center transition-colors"
          style={{ background: "rgba(26,22,20,0.6)", color: "var(--accent-bone)" }}
        >
          <LogOut size={14} strokeWidth={1.8} />
        </button>
      </div>

      {confirmLeave && (
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 glass rounded-xl px-4 py-3 flex flex-col items-center gap-2 min-w-[140px] z-50" style={{ background: "rgba(26,22,20,0.92)" }}>
          <p className="text-[11px] opacity-60">leave room?</p>
          <div className="flex gap-2 w-full">
            <button onClick={leave} className="flex-1 rounded-lg px-3 py-1.5 text-[10px] font-medium" style={{ background: "rgba(201,124,110,0.16)", color: "var(--status-error)" }}>
              leave
            </button>
            <button onClick={() => setConfirmLeave(false)} className="flex-1 hairline rounded-lg px-3 py-1.5 text-[10px] opacity-70">
              stay
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ControlsCluster({ activePanel, onOpenPanel }: { activePanel: PanelKind | "none"; onOpenPanel: (panel: PanelKind) => void }) {
  return (
    <div className="flex items-center gap-1 sm:gap-2 flex-wrap justify-end">
        <div className="glass rounded-full p-1.5 flex items-center gap-1.5">
          <IconBtn label="Wallpaper scene" onClick={() => onOpenPanel("wallpaper")} active={activePanel === "wallpaper"}><ImageIcon size={14} strokeWidth={1.8} /></IconBtn>
          <IconBtn label="Theme" onClick={() => onOpenPanel("theme")} active={activePanel === "theme"}><Settings size={14} strokeWidth={1.8} /></IconBtn>
          <IconBtn label="Chat & activity" onClick={() => onOpenPanel("chat")} active={activePanel === "chat"}><MessageSquare size={14} strokeWidth={1.8} /></IconBtn>
          <IconBtn label="Room info" onClick={() => onOpenPanel("info")} active={activePanel === "info"}><Info size={14} strokeWidth={1.8} /></IconBtn>
        </div>
    </div>
  );
}