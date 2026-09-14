"use client";
import { useRef, useState } from "react";
import { Upload, Clock } from "lucide-react";
import { useRoomStore } from "@/lib/store";
import { getSocket } from "@/lib/socket";
import { uploadWallpaper, resolveAssetUrl } from "@/lib/upload";
import { GRADIENTS, GRADIENT_PREFIX } from "@/lib/wallpaper";
import { pushToast } from "@/components/room/ToastStack";
import { ClockDial } from "@/components/timer/ClockDial";
import { loadPrefs, savePrefs } from "@/lib/prefs";

export function RoomSetupOverlay({ onEnter }: { onEnter: () => void }) {
  const roomId = useRoomStore((s) => s.roomId);
  const currentWallpaper = useRoomStore((s) => s.state.wallpaper);
  const wallpapers = useRoomStore((s) => s.state.wallpapers);
  const pendingTimerMinutes = useRoomStore((s) => s.pendingTimerMinutes);
  const armTimer = useRoomStore((s) => s.armTimer);

  const [title, setTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const [timerDialOpen, setTimerDialOpen] = useState(false);
  const [timerDialValue, setTimerDialValue] = useState(pendingTimerMinutes ?? loadPrefs().lastTimerMinutes);
  const fileRef = useRef<HTMLInputElement>(null);

  const setWallpaper = (url: string | null, kind: "image" | "video") => {
    console.debug("[solace:FE] setup wallpaper:set", { url: url?.slice(0, 120), kind });
    getSocket().emit("wallpaper:set", { url, kind });
  };

  const doUpload = async (file: File) => {
    if (!roomId) return;
    console.debug("[solace:FE] setup upload START", { roomId, name: file.name, size: file.size });
    setUploading(true);
    try {
      const up = await uploadWallpaper(roomId, file);
      console.debug("[solace:FE] setup upload SUCCESS", { url: up.url, kind: up.kind });
      getSocket().emit("wallpaper:set", { url: up.url, kind: up.kind });
    } catch (e) {
      console.debug("[solace:FE] setup upload ERROR", { message: (e as Error).message });
      pushToast((e as Error).message, "err");
    } finally {
      setUploading(false);
    }
  };

  const handleEnter = () => {
    const trimmed = title.trim();
    if (trimmed) {
      console.debug("[solace:FE] setup set_title emit", { title: trimmed });
      getSocket().emit("room:set_title", { title: trimmed });
    }
    onEnter();
  };

  return (
    <div className="fixed inset-0 z-30 grid place-items-center" style={{ background: "rgba(20,17,15,0.85)" }}>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) doUpload(f); e.target.value = ""; }}
      />

      <div className="glass rounded-2xl px-8 py-7 max-w-md w-full warm-glow">
        {/* Title */}
        <div className="mb-5">
          <label className="text-[10px] opacity-50 uppercase tracking-widest">title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={60}
            placeholder="untitled room"
            className="hairline rounded-lg px-3 py-2 w-full text-[12px] mt-1 outline-none"
            style={{ background: "rgba(20,17,15,0.4)" }}
          />
        </div>

        {/* Wallpaper */}
        <div className="mb-5">
          <label className="text-[10px] opacity-50 uppercase tracking-widest">scene</label>
          <div className="grid grid-cols-4 gap-2 mt-2">
            {/* Default tile */}
            <SetupTile
              active={!currentWallpaper.url}
              onClick={() => setWallpaper(null, "image")}
              label="default"
            >
              <div className="absolute inset-0 w-full h-full wallpaper" />
            </SetupTile>

            {/* Gradient tiles */}
            {GRADIENTS.map((g) => {
              const url = `${GRADIENT_PREFIX}${g.id}`;
              const isActive = currentWallpaper.url === url;
              return (
                <SetupTile
                  key={g.id}
                  active={isActive}
                  onClick={() => setWallpaper(url, "image")}
                  label={g.label}
                >
                  <div className="absolute inset-0 w-full h-full" style={{ background: g.css }} />
                </SetupTile>
              );
            })}

            {/* Uploaded tiles */}
            {wallpapers.map((w) => (
              <SetupTile
                key={w.id}
                active={currentWallpaper.url === w.url}
                onClick={() => setWallpaper(w.url, w.kind)}
                label={w.originalName}
              >
                {w.kind === "image" ? (
                  <img src={resolveAssetUrl(w.url) ?? undefined} alt="" referrerPolicy="no-referrer" className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <video src={resolveAssetUrl(w.url) ?? undefined} muted loop playsInline className="absolute inset-0 w-full h-full object-cover" />
                )}
              </SetupTile>
            ))}
          </div>

          {/* Upload button */}
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="mt-3 rounded-full px-4 py-2 text-[11px] flex items-center gap-1.5 justify-center disabled:opacity-50 hairline"
          >
            <Upload size={12} /> {uploading ? "uploading…" : "upload scene"}
          </button>
        </div>

        {/* Timer */}
        <div className="mb-6">
          <label className="text-[10px] opacity-50 uppercase tracking-widest">timer</label>
          {timerDialOpen ? (
            <div className="mt-2 relative mx-auto" style={{ width: 220, height: 240 }}>
              <ClockDial
                value={timerDialValue}
                onChange={setTimerDialValue}
              />
              <button
                onClick={() => {
                  armTimer(timerDialValue);
                  const p = loadPrefs();
                  p.lastTimerMinutes = timerDialValue;
                  savePrefs(p);
                  setTimerDialOpen(false);
                }}
                className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full px-4 py-1 text-[11px] font-medium"
                style={{ background: "var(--accent-amber)", color: "#14110F" }}
              >
                set
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={() => {
                  setTimerDialValue(pendingTimerMinutes ?? loadPrefs().lastTimerMinutes);
                  setTimerDialOpen(true);
                }}
                className="rounded-full px-4 py-1.5 text-[11px] flex items-center gap-1.5"
                style={{
                  background: pendingTimerMinutes !== null ? "var(--accent-amber)" : "rgba(20,17,15,0.4)",
                  color: pendingTimerMinutes !== null ? "#14110F" : undefined,
                }}
              >
                <Clock size={12} />
                {pendingTimerMinutes !== null ? `${pendingTimerMinutes} min` : "Timer"}
              </button>
              {pendingTimerMinutes !== null && (
                <button
                  onClick={() => armTimer(null)}
                  className="rounded-full px-4 py-1.5 text-[11px]"
                  style={{ background: "rgba(20,17,15,0.4)" }}
                >
                  off
                </button>
              )}
            </div>
          )}
        </div>

        {/* CTA */}
        <button
          onClick={handleEnter}
          className="w-full rounded-full px-5 py-2.5 text-[12px] font-medium flex items-center justify-center gap-1.5"
          style={{ background: "var(--accent-amber)", color: "#14110F" }}
        >
          enter room
        </button>
      </div>
    </div>
  );
}

function SetupTile({ active, onClick, label, children }: { active: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="aspect-square rounded-md overflow-hidden relative"
      style={{
        border: active ? "2px solid var(--accent-amber)" : "1px solid rgba(237,224,210,0.1)",
        background: "var(--depth-2)",
      }}
    >
      {children}
      <span className="absolute bottom-1 left-1 max-w-[calc(100%-8px)] text-[9px] opacity-80 px-1 text-left truncate z-10" style={{ background: "rgba(20,17,15,0.6)", borderRadius: 4 }}>{label}</span>
    </button>
  );
}
