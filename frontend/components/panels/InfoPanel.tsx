"use client";
import { useState } from "react";
import { Copy, Check, Pencil, LogOut, X, Lock } from "lucide-react";
import { useRoomStore } from "@/lib/store";
import { getSocket } from "@/lib/socket";
import { useRouter } from "next/navigation";

export function InfoPanel({ onClose }: { onClose: () => void }) {
  const roomId = useRoomStore((s) => s.roomId);
  const title = useRoomStore((s) => s.state.title);
  const isProtected = useRoomStore((s) => s.state.protected);
  const members = useRoomStore((s) => s.members);
  const isHost = members[0]?.isHost ?? false; // creator is first in snapshot (see TitleChip host note)
  const [copied, setCopied] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [draftTitle, setDraftTitle] = useState<string | null>(null);
  const router = useRouter();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(roomId ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };

  const commitTitle = () => {
    const t = draftTitle?.trim().slice(0, 60);
    if (t && t !== title) getSocket().emit("room:set_title", { title: t });
    setDraftTitle(null);
  };

  const leave = () => {
    getSocket().emit("room:leave");
    router.replace("/");
  };

  return (
    <div className="p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[12px]" style={{ color: "var(--status-info)" }}>room info</p>
        <button aria-label="Close" onClick={onClose}><X size={14} className="opacity-60" /></button>
      </div>

      <div className="space-y-2">
        <Row label="title">
          {draftTitle === null ? (
            <span className="flex items-center gap-2">
              <span className="truncate max-w-[150px]">{title || "untitled"}</span>
              {isHost && <button aria-label="edit title" onClick={() => setDraftTitle(title)}><Pencil size={10} className="opacity-50" /></button>}
            </span>
          ) : (
            <input autoFocus value={draftTitle} maxLength={60} onChange={(e) => setDraftTitle(e.target.value)} onBlur={commitTitle} onKeyDown={(e) => e.key === "Enter" && commitTitle()} className="bg-transparent outline-none border-b hairline" />
          )}
        </Row>
        <Row label="code">
          <span className="flex items-center gap-2">
            <span className="tracking-widest">{roomId}</span>
            {isProtected && <Lock size={10} style={{ color: "var(--accent-amber)" }} aria-label="password protected" />}
            <button aria-label="copy code" onClick={copy}>{copied ? <Check size={11} style={{ color: "var(--status-success)" }} /> : <Copy size={11} className="opacity-50" />}</button>
          </span>
        </Row>
        <Row label="members"><span>{members.length} / 4</span></Row>
        <div className="space-y-1 mt-2">
          {members.map((m) => (
            <div key={m.socketId} className="flex items-center gap-2 text-[11px]">
              <div className="w-5 h-5 rounded-full grid place-items-center text-[7px] overflow-hidden" style={{ background: m.avatar ? "transparent" : "var(--depth-3)" }}>
                {m.avatar ? <img src={m.avatar} alt="" className="w-full h-full object-cover" /> : (m.displayName.slice(0, 2).toUpperCase())}
              </div>
              <span className="opacity-80">{m.displayName}</span>
              {m.isHost && <span className="text-[8px] opacity-40">host</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-auto">
        {confirmLeave ? (
          <div className="flex gap-2">
            <button onClick={leave} className="flex-1 rounded-lg px-3 py-2 text-[11px]" style={{ background: "rgba(201,124,110,0.16)", color: "var(--status-error)" }}>confirm leave</button>
            <button onClick={() => setConfirmLeave(false)} className="flex-1 hairline rounded-lg px-3 py-2 text-[11px] opacity-70">cancel</button>
          </div>
        ) : (
          <button onClick={() => setConfirmLeave(true)} className="w-full rounded-lg px-3 py-2 text-[11px] flex items-center justify-center gap-1.5" style={{ background: "rgba(201,124,110,0.12)", color: "var(--status-error)" }}>
            <LogOut size={11} /> leave room
          </button>
        )}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="hairline rounded-md px-3 py-2 text-[11px] flex items-center justify-between">
      <span className="opacity-50">{label}</span>
      <span className="flex items-center gap-2">{children}</span>
    </div>
  );
}