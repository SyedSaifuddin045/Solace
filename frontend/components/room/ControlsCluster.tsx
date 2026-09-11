"use client";
import { useState } from "react";
import { Mic, MicOff, Video, VideoOff, Settings, MessageSquare, Info, Image as ImageIcon, LogOut, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRoomStore } from "@/lib/store";
import { getSocket } from "@/lib/socket";
import { startRtc, stopRtc } from "@/lib/rtc";
import { ChatPanel } from "@/components/panels/ChatPanel";
import { InfoPanel } from "@/components/panels/InfoPanel";
import { ThemePanel } from "@/components/panels/ThemePanel";
import { WallpaperPanel } from "@/components/panels/WallpaperPanel";

type Overlay = "none" | "chat" | "info" | "theme" | "wallpaper";

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

export function ControlsCluster() {
  const [overlay, setOverlay] = useState<Overlay>("none");
  const audioOn = useRoomStore((s) => s.audioOnLocal);
  const videoOn = useRoomStore((s) => s.videoOnLocal);
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
        // getUserMedia rejected (permission/device) — media stays off
        console.debug("[solace:FE] startRtc rejected", {
          nextAudio,
          nextVideo,
          name: (err as DOMException)?.name,
          message: (err as DOMException)?.message,
        });
      });
  };

  return (
    <div className="relative z-30">
      {overlay !== "none" && (
        <>
          <div className="fixed inset-0 z-[29]" onClick={() => setOverlay("none")} style={{ background: "rgba(0,0,0,0.3)" }} />
          <div className="fixed inset-y-0 right-0 w-full max-w-sm glass z-30 flex flex-col" style={{ background: "rgba(26,22,20,0.92)" }}>
            <div className="flex justify-end p-3">
              <button aria-label="Close panel" onClick={() => setOverlay("none")} className="rounded-full p-1.5" style={{ background: "rgba(237,224,210,0.08)", color: "var(--accent-bone)" }}>
                <X size={14} strokeWidth={1.8} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              {overlay === "chat" && <ChatPanel onClose={() => setOverlay("none")} />}
              {overlay === "info" && <InfoPanel onClose={() => setOverlay("none")} />}
              {overlay === "theme" && <ThemePanel onClose={() => setOverlay("none")} />}
              {overlay === "wallpaper" && <WallpaperPanel onClose={() => setOverlay("none")} />}
            </div>
          </div>
        </>
      )}

      <div className="flex items-center gap-2">
        <div className="glass rounded-full p-1.5 flex items-center gap-1.5 warm-glow">
          <IconBtn label="Toggle mic" onClick={() => toggleMedia("audio")} tint={audioOn ? undefined : "var(--status-error)"} active={audioOn}>
            {audioOn ? <Mic size={14} strokeWidth={1.8} /> : <MicOff size={14} strokeWidth={1.8} />}
          </IconBtn>
          <IconBtn label="Toggle camera" onClick={() => toggleMedia("video")} tint={videoOn ? undefined : "var(--status-error)"} active={videoOn}>
            {videoOn ? <Video size={14} strokeWidth={1.8} /> : <VideoOff size={14} strokeWidth={1.8} />}
          </IconBtn>
        </div>
        <button
          aria-label="Leave room"
          onClick={() => {
            getSocket().emit("room:leave");
            console.debug("[solace:FE] leave room stopRtc", {});
            stopRtc();
            useRoomStore.getState().reset();
            router.replace("/");
          }}
          className="glass rounded-full p-1.5 grid place-items-center"
        >
          <LogOut size={14} strokeWidth={1.8} style={{ color: "var(--accent-bone)" }} />
        </button>
        <div className="glass rounded-full p-1.5 flex items-center gap-1.5">
          <IconBtn label="Wallpaper scene" onClick={() => setOverlay("wallpaper")} active={overlay === "wallpaper"}><ImageIcon size={14} strokeWidth={1.8} /></IconBtn>
          <IconBtn label="Theme" onClick={() => setOverlay("theme")} active={overlay === "theme"}><Settings size={14} strokeWidth={1.8} /></IconBtn>
          <IconBtn label="Chat & activity" onClick={() => setOverlay("chat")} active={overlay === "chat"}><MessageSquare size={14} strokeWidth={1.8} /></IconBtn>
          <IconBtn label="Room info" onClick={() => setOverlay("info")} active={overlay === "info"}><Info size={14} strokeWidth={1.8} /></IconBtn>
        </div>
      </div>
    </div>
  );
}