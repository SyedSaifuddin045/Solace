"use client";
import { useEffect, useState } from "react";
import { ArrowRight, Lock } from "lucide-react";
import { getSocket } from "@/lib/socket";
import { loadPrefs } from "@/lib/prefs";
import { useRoomStore } from "@/lib/store";
import { writeRoomPassword } from "@/lib/password";
import { userMessage } from "@/lib/errors";

// Gate for protected rooms during reload / re-entry. Renders when the server
// rejects the re-join for a missing/wrong password. On success the shared
// room:joined listener hydrates the store, clears the error, and the gate
// unmounts.
export function PasswordGate({ roomId }: { roomId: string }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const error = useRoomStore((s) => s.error);
  const joined = useRoomStore((s) => s.roomId === roomId);

  useEffect(() => {
    if (joined && password) writeRoomPassword(roomId, password);
  }, [joined, password, roomId]);

  // a fresh room:error means the previous attempt failed — re-enable submit
  useEffect(() => {
    if (error) setBusy(false);
  }, [error]);

  const submit = () => {
    if (busy || !password) return;
    setBusy(true);
    const prefs = loadPrefs();
    getSocket().emit("room:join", { roomId, displayName: prefs.name, avatar: prefs.avatar, password });
  };

  return (
    <main className="wallpaper min-h-screen grid place-items-center p-6">
      <div className="glass rounded-2xl px-8 py-7 max-w-sm w-full text-center">
        <div className="flex justify-center mb-3" style={{ color: "var(--accent-amber)" }}>
          <Lock size={18} />
        </div>
        <h1 className="text-[14px] mb-1 tracking-wide">protected room</h1>
        <p className="text-[11px] mb-4 opacity-60 tracking-widest">{roomId}</p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          autoFocus
          placeholder="password"
          className="hairline rounded-lg px-3 py-2 w-full text-[12px] outline-none"
          style={{ background: "rgba(20,17,15,0.4)" }}
        />
        {error && error.code !== "ROOM_NOT_FOUND" && error.code !== "ROOM_FULL" && (
          <p className="mt-3 text-[11px]" style={{ color: "var(--status-error)" }}>
            {userMessage(error.code, error.message)}
          </p>
        )}
        <button
          onClick={submit}
          disabled={busy || !password}
          className="rounded-full px-5 py-2 text-[12px] flex items-center gap-1.5 mt-4 mx-auto disabled:opacity-50"
          style={{ background: "var(--accent-amber)", color: "#14110F" }}
        >
          <ArrowRight size={12} /> {busy ? "joining…" : "Enter"}
        </button>
      </div>
    </main>
  );
}