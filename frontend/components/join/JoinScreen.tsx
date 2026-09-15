"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Plus, Lock } from "lucide-react";
import { AvatarPicker } from "@/components/join/AvatarPicker";
import { loadPrefs, savePrefs, touchRecentRoom } from "@/lib/prefs";
import { getSocket } from "@/lib/socket";
import { useRoomStore } from "@/lib/store";
import { writeRoomPassword } from "@/lib/password";
import type { Member, RoomState } from "@/lib/store";
import { userMessage } from "@/lib/errors";

// room code: 6 chars, A-Z + 2-9 (contract). Normalize input.
const normalizeCode = (raw: string) =>
  raw.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6);

type Mode = "join" | "create";

export function JoinScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("join");
  const [name, setName] = useState(() => loadPrefs().name);
  const [avatar, setAvatar] = useState<string | null>(() => loadPrefs().avatar);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [passwordRequired, setPasswordRequired] = useState(false);
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

  // Pre-check only matters while joining: reveal the password field the
  // moment the code resolves to a protected room. Create never needs it.
  // (passwordRequired only ever flips inside socket event handlers — never
  // synchronously in the effect body per react-hooks/set-state-in-effect.)
  useEffect(() => {
    if (mode !== "join" || code.trim().length !== 6) return;
    const socket = getSocket();
    const onResult = (p?: { roomId: string; protected: boolean }) => {
      if (p && p.roomId === code) setPasswordRequired(!!p.protected);
    };
    const onErr = () => { setPasswordRequired(false); };
    socket.on("room:check_result", onResult);
    socket.on("room:error", onErr);
    socket.emit("room:check", { roomId: code });
    return () => { socket.off("room:check_result", onResult); socket.off("room:error", onErr); };
  }, [mode, code]);

  const switchMode = (m: Mode) => {
    if (busy) return;
    setMode(m);
    setError(null);
    setPasswordRequired(false);
  };

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
      if (p && p.roomId) writeRoomPassword(p.roomId, password);
      hydrate(p);
      if (p) routeToRoom(p.roomId);
    };
    const onError = (p?: { code: string; message: string }) => {
      socket.off("room:joined", onJoined as never);
      socket.off("room:error", onError as never);
      setBusy(null);
      console.debug("[solace:FE] join room:error received", { code: p?.code, message: p?.message });
      if (p?.code === "ROOM_PASSWORD_REQUIRED" || p?.code === "WRONG_PASSWORD") setPasswordRequired(true);
      setError(userMessage(p?.code ?? "", p?.message ?? ""));
      useRoomStore.getState().clearError();
    };
    socket.on("room:joined", onJoined as never);
    socket.on("room:error", onError as never);
    console.debug("[solace:FE] room:join emit", { roomId: code, displayName: name, hasAvatar: !!avatar, hasPassword: !!password });
    socket.emit("room:join", { roomId: code, displayName: name, avatar, password: password || undefined });
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
      if (p && p.roomId) writeRoomPassword(p.roomId, password);
      hydrate(p);
      sessionStorage.setItem("solace:setup", "1");
      console.debug("[solace:FE] setup flag set", { roomId: p?.roomId });
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
    console.debug("[solace:FE] room:create emit", { displayName: name, hasAvatar: !!avatar, hasPassword: !!password });
    socket.emit("room:create", { displayName: name, avatar, password: password || undefined });
  };

  return (
    <main className="wallpaper min-h-screen grid place-items-center p-6">
      <div className="glass rounded-2xl px-8 py-7 max-w-sm w-full warm-glow text-center">
        <h1 className="text-[15px] mb-1 tracking-wide">solace</h1>
        <p className="text-[11px] mb-5 opacity-60">a quiet room for the same evening</p>

        <div className="flex gap-1 justify-center mb-5">
          <button
            onClick={() => switchMode("join")}
            disabled={busy !== null}
            className="rounded-full px-4 py-1.5 text-[11px] transition-colors"
            style={mode === "join"
              ? { background: "var(--accent-amber)", color: "#14110F" }
              : { opacity: 0.55 }}
          >
            join a room
          </button>
          <button
            onClick={() => switchMode("create")}
            disabled={busy !== null}
            className="rounded-full px-4 py-1.5 text-[11px] transition-colors"
            style={mode === "create"
              ? { background: "var(--accent-amber)", color: "#14110F" }
              : { opacity: 0.55 }}
          >
            create a room
          </button>
        </div>

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

        {mode === "join" && (
          <>
            <div className="mt-3 text-left">
              <label className="text-[10px] opacity-50 uppercase tracking-widest">room code</label>
              <input
                value={code}
                onChange={(e) => {
                  const next = normalizeCode(e.target.value);
                  setCode(next);
                  if (next.length !== 6) setPasswordRequired(false);
                }}
                placeholder="ABC123"
                className="hairline rounded-lg px-3 py-2 w-full text-[12px] mt-1 outline-none tracking-widest"
                style={{ background: "rgba(20,17,15,0.4)" }}
              />
            </div>

            {passwordRequired && (
              <div className="mt-3 text-left">
                <label className="text-[10px] opacity-50 uppercase tracking-widest flex items-center gap-1">
                  <Lock size={9} /> password
                  <span style={{ color: "var(--accent-amber)" }}>— required</span>
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="required · 4–32 chars"
                  className="hairline rounded-lg px-3 py-2 w-full text-[12px] mt-1 outline-none"
                  style={{ background: "rgba(20,17,15,0.4)" }}
                />
              </div>
            )}
          </>
        )}

        {mode === "create" && (
          <div className="mt-3 text-left">
            <label className="text-[10px] opacity-50 uppercase tracking-widest flex items-center gap-1">
              <Lock size={9} /> password
              <span style={{ color: "var(--accent-amber)" }}>— optional, protects your room</span>
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="optional · 4–32 chars"
              className="hairline rounded-lg px-3 py-2 w-full text-[12px] mt-1 outline-none"
              style={{ background: "rgba(20,17,15,0.4)" }}
            />
          </div>
        )}

        {error && (
          <p className="mt-3 text-[11px]" style={{ color: "var(--status-error)" }}>{error}</p>
        )}

        <div className="flex gap-2 justify-center mt-4">
          {mode === "join" ? (
            <button
              onClick={doJoin}
              disabled={busy !== null}
              className="rounded-full px-5 py-2 text-[12px] flex items-center gap-1.5 disabled:opacity-50"
              style={{ background: "var(--accent-amber)", color: "#14110F" }}
            >
              <ArrowRight size={12} /> {busy === "join" ? "joining…" : "Join"}
            </button>
          ) : (
            <button
              onClick={doCreate}
              disabled={busy !== null}
              className="rounded-full px-5 py-2 text-[12px] flex items-center gap-1.5 disabled:opacity-50"
              style={{ background: "var(--accent-amber)", color: "#14110F" }}
            >
              <Plus size={12} /> {busy === "create" ? "creating…" : "Create room"}
            </button>
          )}
        </div>

        {mode === "join" && recentRooms.length > 0 && (
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