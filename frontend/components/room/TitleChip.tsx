"use client";
import { useState } from "react";
import { Pencil } from "lucide-react";
import { useRoomStore } from "@/lib/store";
import { getSocket } from "@/lib/socket";

export function TitleChip() {
  const title = useRoomStore((s) => s.state.title);
  // Host detection: contract has isHost per member, but the client may not know its
  // own socketId post-join snapshot. Simplest reliable v1: first member in the
  // room:joined snapshot is the creator/host (members[0]). Refine when the backend
  // exposes own socketId (CONTRACT-DELTAS optional).
  const isHost = useRoomStore((s) => s.members[0]?.isHost ?? false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const commit = () => {
    const t = draft.trim().slice(0, 60);
    if (t && t !== title) getSocket().emit("room:set_title", { title: t });
    setEditing(false);
  };

  return (
    <div className="glass rounded-xl px-4 py-2 warm-glow">
      {editing && isHost ? (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={draft}
            maxLength={60}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => (e.key === "Enter" ? commit() : e.key === "Escape" ? setEditing(false) : undefined)}
            onBlur={commit}
            className="bg-transparent outline-none text-[13px] w-48"
          />
        </div>
      ) : (
        <button
          className="flex items-center gap-2 text-left"
          onClick={() => { if (isHost) { setDraft(title); setEditing(true); } }}
          title={isHost ? "rename" : undefined}
        >
          <span className="text-[13px] tracking-wide">{title || "untitled room"}</span>
          {isHost && <Pencil size={10} className="opacity-50" />}
        </button>
      )}
    </div>
  );
}