"use client";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { userMessage } from "@/lib/errors";

export function ErrorPage({ code }: { code: "ROOM_NOT_FOUND" | "ROOM_FULL" }) {
  const router = useRouter();
  return (
    <main className="wallpaper min-h-screen grid place-items-center p-6">
      <div className="glass rounded-2xl px-8 py-7 max-w-sm w-full text-center warm-glow">
        <p className="text-[15px]" style={{ color: code === "ROOM_FULL" ? "var(--status-warning)" : "var(--status-error)" }}>
          {code === "ROOM_FULL" ? "Room is full" : "Room not found"}
        </p>
        <p className="text-[11px] opacity-60 mt-2">{userMessage(code, "")}</p>
        <button onClick={() => router.replace("/")} className="mt-5 rounded-full px-5 py-2 text-[12px] flex items-center gap-1.5 mx-auto hairline">
          <ArrowLeft size={12} /> back to start
        </button>
      </div>
    </main>
  );
}