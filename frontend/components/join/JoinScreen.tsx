"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Plus } from "lucide-react";
import { AvatarPicker } from "@/components/join/AvatarPicker";
import { loadPrefs, savePrefs, touchRecentRoom } from "@/lib/prefs";
import { getSocket } from "@/lib/socket";
import { useRoomStore } from "@/lib/store";
import type { Member, RoomState } from "@/lib/store";
import { userMessage } from "@/lib/errors";

// room code: 6 chars, A-Z + 2-9 (contract). Normalize input.
const normalizeCode = (raw: string) =>
  raw.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6);

export function JoinScreen() {
  const router = useRouter();
  const [name, setName] = useState(() => loadPrefs().name);
  const [avatar, setAvatar] = useState<string | null>(() => loadPrefs().avatar);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"join" | "create" | null>(null);
  const [recentRooms, setRecentRooms] = useState<string[]>([]);

  useEffect(() => {
    // client-only mount hydration from localStorage (avoid SSR hydration mismatch)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecentRooms(loadPrefs().recentRooms);
  }, []);

  const commitPrefs = () => {
    const p = loadPrefs();
    p.name = name.slice(0, 24);
    p.avatar = avatar;
    savePrefs(p);
  };

  useEffect(() => {
    commitPrefs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, avatar]);

  const routeToRoom = (roomId: string) => {
    touchRecentRoom(roomId);
    setRecentRooms(loadPrefs().recentRooms);
    router.replace(`/room/${roomId}`);
  };

  // hydrate store from the join/create snapshot so RoomScreen skips re-join
  // (server rejects a duplicate join with ALREADY_IN_ROOM)
  const hydrate = (p?: { roomId?: string; members?: Member[]; state?: RoomState }) => {
    if (p && p.roomId && p.members && p.state) {
      useRoomStore.getState().applyEvent("room:joined", p);
    }
  };

  const doJoin = () => {
    if (busy) return;
    console.debug("[solace:FE] doJoin", { busy, name, code: code.trim() });
    if (!code.trim()) { setError("Enter a room code."); return; }
    commitPrefs();
    setBusy("join");
    setError(null);
    const socket = getSocket();
    const onJoined = (p?: { roomId: string; members?: Member[]; state?: RoomState }) => {
      socket.off("room:joined", onJoined as never);
      socket.off("room:error", onError as never);
      setBusy(null);
      console.debug("[solace:FE] room:joined received", { roomId: p?.roomId, memberCount: p?.members?.length, hasState: !!p?.state });
      hydrate(p);
      if (p) routeToRoom(p.roomId);
    };
    const onError = (p?: { code: string; message: string }) => {
      socket.off("room:joined", onJoined as never);
      socket.off("room:error", onError as never);
      setBusy(null);
      console.debug("[solace:FE] join room:error received", { code: p?.code, message: p?.message });
      setError(userMessage(p?.code ?? "", p?.message ?? ""));
      useRoomStore.getState().clearError();
    };
    socket.on("room:joined", onJoined as never);
    socket.on("room:error", onError as never);
    console.debug("[solace:FE] room:join emit", { roomId: code, displayName: name, hasAvatar: !!avatar });
    socket.emit("room:join", { roomId: code, displayName: name, avatar });
  };

  const doCreate = () => {
    if (busy) return;
    console.debug("[solace:FE] doCreate", { busy, name });
    commitPrefs();
    setBusy("create");
    setError(null);
    const socket = getSocket();
    const onCreated = (p?: { roomId: string; members?: Member[]; state?: RoomState }) => {
      socket.off("room:created", onCreated as never);
      socket.off("room:error", onError as never);
      setBusy(null);
      console.debug("[solace:FE] room:created received", { roomId: p?.roomId, memberCount: p?.members?.length, hasState: !!p?.state });
      hydrate(p);
      if (p) routeToRoom(p.roomId);
    };
    const onError = (p?: { code: string; message: string }) => {
      socket.off("room:created", onCreated as never);
      socket.off("room:error", onError as never);
      setBusy(null);
      console.debug("[solace:FE] create room:error received", { code: p?.code, message: p?.message });
      setError(userMessage(p?.code ?? "", p?.message ?? ""));
      useRoomStore.getState().clearError();
    };
    socket.on("room:created", onCreated as never);
    socket.on("room:error", onError as never);
    console.debug("[solace:FE] room:create emit", { displayName: name, hasAvatar: !!avatar });
    socket.emit("room:create", { displayName: name, avatar });
  };

  return (
    <main className="wallpaper min-h-screen grid place-items-center p-6">
      <div className="glass rounded-2xl px-8 py-7 max-w-sm w-full warm-glow text-center">
        <h1 className="text-[15px] mb-1 tracking-wide">solace</h1>
        <p className="text-[11px] mb-5 opacity-60">a quiet room for the same evening</p>

        <div className="flex justify-center">
          <AvatarPicker value={avatar} onChange={setAvatar} />
        </div>

        <div className="mt-4 text-left">
          <label className="text-[10px] opacity-50 uppercase tracking-widest">name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={24}
            placeholder="display name"
            className="hairline rounded-lg px-3 py-2 w-full text-[12px] mt-1 outline-none"
            style={{ background: "rgba(20,17,15,0.4)" }}
          />
        </div>

        <div className="mt-3 text-left">
          <label className="text-[10px] opacity-50 uppercase tracking-widest">room code</label>
          <input
            value={code}
            onChange={(e) => setCode(normalizeCode(e.target.value))}
            placeholder="ABC123"
            className="hairline rounded-lg px-3 py-2 w-full text-[12px] mt-1 outline-none tracking-widest"
            style={{ background: "rgba(20,17,15,0.4)" }}
          />
        </div>

        {error && (
          <p className="mt-3 text-[11px]" style={{ color: "var(--status-error)" }}>{error}</p>
        )}

        <div className="flex gap-2 justify-center mt-4">
          <button
            onClick={doJoin}
            disabled={busy !== null}
            className="rounded-full px-5 py-2 text-[12px] flex items-center gap-1.5 disabled:opacity-50"
            style={{ background: "var(--accent-amber)", color: "#14110F" }}
          >
            <ArrowRight size={12} /> {busy === "join" ? "joining…" : "Join"}
          </button>
          <button
            onClick={doCreate}
            disabled={busy !== null}
            className="hairline rounded-full px-5 py-2 text-[12px] flex items-center gap-1.5 disabled:opacity-50"
          >
            <Plus size={12} /> {busy === "create" ? "creating…" : "Create room"}
          </button>
        </div>

        {recentRooms.length > 0 && (
          <div className="mt-5">
            <p className="text-[9px] opacity-40 uppercase tracking-widest mb-1.5">recent rooms</p>
            <div className="flex gap-1.5 justify-center flex-wrap">
              {recentRooms.map((r) => (
                <button key={r} onClick={() => setCode(r)} className="hairline rounded-full px-3 py-1 text-[10px] opacity-70 hover:opacity-100">
                  {r}
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="text-[9px] opacity-40 mt-5">no accounts · name + avatar shared to the room</p>
      </div>
    </main>
  );
}