"use client";
import { useState } from "react";
import { Mic, MicOff, Video, VideoOff, Settings, MessageSquare, Info, X } from "lucide-react";
import { getSocket } from "@/lib/socket";

type Overlay = "none" | "chat" | "info" | "theme";

// v1 note: media toggles emit the contract's rtc:media event and track locally.
// Phase 6 (RTC manager) owns real getUserMedia + store flags and replaces this.
// Chat/Info/Theme buttons hold overlay state; their panels (drawer content) land in Phase 5.

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
  const [audioOn, setAudioOn] = useState(false);
  const [videoOn, setVideoOn] = useState(false);

  const toggleMedia = (kind: "audio" | "video") => {
    const nextAudio = kind === "audio" ? !audioOn : audioOn;
    const nextVideo = kind === "video" ? !videoOn : videoOn;
    setAudioOn(nextAudio);
    setVideoOn(nextVideo);
    getSocket().emit("rtc:media", { audio: nextAudio, video: nextVideo });
  };

  const title = overlay === "chat" ? "room stream" : overlay === "info" ? "room info" : "room mood";

  return (
    <>
      {overlay !== "none" && (
        <div className="fixed inset-0 z-30" onClick={() => setOverlay("none")}>
          <div className="absolute inset-y-0 right-0 w-full max-w-sm glass" style={{ background: "rgba(26,22,20,0.85)" }} onClick={(e) => e.stopPropagation()}>
            <div className="p-4 h-full flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[12px] capitalize" style={{ color: "var(--accent-amber)" }}>{title}</p>
                <button aria-label="Close" onClick={() => setOverlay("none")}><X size={14} className="opacity-60" /></button>
              </div>
              <p className="text-[10px] opacity-50 mt-4">This panel lands with Phase 5 (chat · info · theme).</p>
            </div>
          </div>
        </div>
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
        <div className="glass rounded-full p-1.5 flex items-center gap-1.5">
          <IconBtn label="Theme" onClick={() => setOverlay("theme")}><Settings size={14} strokeWidth={1.8} /></IconBtn>
          <IconBtn label="Chat & activity" onClick={() => setOverlay("chat")}><MessageSquare size={14} strokeWidth={1.8} /></IconBtn>
          <IconBtn label="Room info" onClick={() => setOverlay("info")}><Info size={14} strokeWidth={1.8} /></IconBtn>
        </div>
      </div>
    </>
  );
}