"use client";
import { useRef, useState } from "react";
import { Upload, Volume2, VolumeX, X, Video } from "lucide-react";
import { useRoomStore } from "@/lib/store";
import { getSocket } from "@/lib/socket";
import { uploadWallpaper, resolveAssetUrl } from "@/lib/upload";
import { isGradientUrl, gradientCss, GRADIENTS, GRADIENT_PREFIX } from "@/lib/wallpaper";
import { pushToast } from "@/components/room/ToastStack";

export function WallpaperPanel({ onClose }: { onClose: () => void }) {
  const wallpapers = useRoomStore((s) => s.state.wallpapers);
  const current = useRoomStore((s) => s.state.wallpaper);
  const roomId = useRoomStore((s) => s.roomId);
  const [busy, setBusy] = useState(false);
  const [mutedVideos, setMutedVideos] = useState<Record<string, boolean>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  const setScene = (url: string | null, kind: "image" | "video") => {
    getSocket().emit("wallpaper:set", { url, kind });
  };

  const doUpload = async (file: File) => {
    if (!roomId) return;
    setBusy(true);
    try {
      const up = await uploadWallpaper(roomId, file);
      getSocket().emit("wallpaper:set", { url: up.url, kind: up.kind });
    } catch (e) {
      pushToast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };

  const specials = [
    { url: null, kind: "image" as const, title: "default dusk" },
    ...GRADIENTS.map((g) => ({
      url: `${GRADIENT_PREFIX}${g.id}`,
      kind: "image" as const,
      title: g.label,
    })),
  ];

  return (
    <div className="p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[12px]" style={{ color: "var(--accent-rose)" }}>scenes</p>
        <button aria-label="Close" onClick={onClose}><X size={14} className="opacity-60" /></button>
      </div>

      <p className="text-[10px] opacity-50 mb-1.5">room library — max 3 uploads</p>
      <div className="grid grid-cols-2 gap-2 overflow-y-auto flex-1 content-start">
        {specials.map((sp) => (
          <Tile key={sp.title} active={!current.url} onClick={() => setScene(sp.url, sp.kind)} label={sp.title} kind={sp.kind} url={sp.url} />
        ))}
        {wallpapers.map((w) => (
          <div key={w.id} className="relative group">
            <Tile
              active={current.url === w.url}
              onClick={() => setScene(w.url, w.kind)}
              kind={w.kind}
              label={w.originalName}
              url={w.url}
            />
            {w.kind === "video" && (
              <button
                aria-label="toggle video sound"
                onClick={(e) => { e.stopPropagation(); setMutedVideos((m) => ({ ...m, [w.id]: !m[w.id] })); }}
                className="absolute top-1 right-1 p-1 rounded-full"
                style={{ background: "rgba(20,17,15,0.7)" }}
              >
                {mutedVideos[w.id] ? <VolumeX size={10} /> : <Volume2 size={10} />}
              </button>
            )}
          </div>
        ))}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) doUpload(f); e.target.value = ""; }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="mt-3 rounded-full px-4 py-2 text-[11px] flex items-center gap-1.5 justify-center disabled:opacity-50"
        style={{ background: "var(--accent-amber)", color: "#14110F" }}
      >
        <Upload size={12} /> {busy ? "uploading…" : "upload scene"}
      </button>

      <p className="text-[9px] opacity-40 mt-2">
        video scenes render silent — toggle the speaker to make a scene audible on your device only.
      </p>
      <p className="text-[9px] opacity-40">oldest unused upload is evicted automatically when the library caps.</p>
    </div>
  );
}

function Tile({ active, onClick, kind, label, url }: { active: boolean; onClick: () => void; kind: "image" | "video"; label: string; url: string | null }) {
  const isGrad = isGradientUrl(url);
  const gradCss = isGrad ? gradientCss(url) : null;
  const src = isGrad ? null : resolveAssetUrl(url);
  const [imgErr, setImgErr] = useState(false);

  return (
    <button
      onClick={onClick}
      className="aspect-square rounded-md overflow-hidden relative"
      style={{
        border: active ? "2px solid var(--accent-amber)" : "1px solid rgba(237,224,210,0.1)",
        background: "var(--depth-2)",
      }}
    >
      {/* gradient tiles */}
      {isGrad && gradCss && <div className="absolute inset-0 w-full h-full" style={{ background: gradCss }} />}
      {isGrad && !gradCss && <div className="absolute inset-0 w-full h-full wallpaper" />}
      {/* default dusk (url=null, not gradient) */}
      {!isGrad && !url && <div className="absolute inset-0 w-full h-full wallpaper" />}
      {/* uploaded image */}
      {!isGrad && src && kind === "image" && !imgErr && (
        <img src={src} alt="" className="absolute inset-0 w-full h-full object-cover" onError={() => setImgErr(true)} />
      )}
      {/* uploaded video */}
      {!isGrad && src && kind === "video" && (
        <video src={src} muted loop playsInline className="absolute inset-0 w-full h-full object-cover" />
      )}
      {/* error fallback only for uploads that have a URL but failed */}
      {src && imgErr && (
        <div className="absolute inset-0 grid place-items-center text-[8px] opacity-40">no preview</div>
      )}
      <span className="absolute bottom-1 left-1 max-w-[calc(100%-8px)] text-[9px] opacity-80 px-1 text-left truncate z-10" style={{ background: "rgba(20,17,15,0.6)", borderRadius: 4 }}>{label}</span>
      {kind === "video" && !isGrad && (
        <span className="absolute top-1 left-1 text-[7px] opacity-70 flex items-center gap-0.5 z-10"><Video size={8} /> video</span>
      )}
    </button>
  );
}