"use client";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Mic, MicOff, PictureInPicture2, Video, VideoOff } from "lucide-react";
import { useRoomStore, type Member } from "@/lib/store";
import { VideoFeed } from "@/components/video/VideoFeed";
import { useIdle } from "@/hooks/useIdle";
import { pinnedIds, memberHasMedia } from "@/lib/tiles";

function MemberRow({
  m,
  speaking,
  expanded,
  hasMedia,
  onHover,
}: {
  m: Member;
  speaking?: boolean;
  expanded?: boolean;
  hasMedia?: boolean;
  onHover: (id: string | null) => void;
}) {
  const initials = (m.displayName || "?").slice(0, 2).toUpperCase();
  const detached = useRoomStore((s) => s.detachedFeed?.socketId === m.socketId);
  return (
    <motion.div layout transition={{ type: "spring", stiffness: 300, damping: 28 }} className="flex flex-col items-end gap-1.5">
      <motion.div
        layout
        transition={{ type: "spring", stiffness: 300, damping: 28 }}
        className="glass rounded-full flex items-center gap-2 py-1"
        onMouseEnter={() => onHover(m.socketId)}
        onMouseLeave={() => onHover(null)}
        style={{
          paddingLeft: 4,
          paddingRight: expanded ? 12 : 8,
          borderColor: speaking ? "var(--accent-amber)" : undefined,
          boxShadow: speaking ? "0 0 14px rgba(224,164,88,0.25)" : undefined,
        }}
      >
        <div className="w-7 h-7 rounded-full grid place-items-center text-[10px] font-semibold overflow-hidden shrink-0"
          style={{ background: m.avatar ? "transparent" : "var(--accent-violet)", color: "#14110F" }}>
          {m.avatar ? <img src={m.avatar} alt="" className="w-full h-full object-cover" /> : initials}
        </div>
        {(expanded || speaking) && (
          <span className="text-[11px] max-w-[90px] truncate" style={{ color: speaking ? "var(--accent-amber)" : undefined }}>
            {m.displayName}
          </span>
        )}
        {expanded && (
          <span className="flex items-center gap-1 text-[9px] opacity-60 ml-1">
            {m.audioOn ? <Mic size={10} style={{ color: "var(--status-success)" }} /> : <MicOff size={10} style={{ color: "var(--status-error)" }} />}
            {m.videoOn ? <Video size={10} style={{ color: "var(--status-success)" }} /> : <VideoOff size={10} style={{ color: "var(--status-error)" }} />}
          </span>
        )}
      </motion.div>
      {expanded && hasMedia && !detached && <VideoFeed socketId={m.socketId} memberName={m.displayName} />}
      {expanded && hasMedia && detached && (
        <button
          onClick={() => useRoomStore.getState().dockFeed()}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-[9px] opacity-70 hover:opacity-100"
          style={{ background: "rgba(26,22,20,0.6)" }}
          title="feed is floating (PiP) — click to dock"
        >
          <PictureInPicture2 size={10} /> floating · dock
        </button>
      )}
    </motion.div>
  );
}

export function UsersStack() {
  const members = useRoomStore((s) => s.members);
  const speaking = useRoomStore((s) => s.speaking);
  const remoteStreams = useRoomStore((s) => s.remoteStreams);
  const idle = useIdle();
  const [hoverId, setHoverId] = useState<string | null>(null);

  // Pinned = live media actually received (or talking). Pinned members NEVER
  // disappear on inactivity; everyone else hides once the chrome goes idle.
  // A self-reported `audioOn` flag does NOT pin — only a live, unmuted remote
  // audio track (actual sound from the other end) or speaking energy does.
  const pinned = pinnedIds(members, remoteStreams, speaking);
  const visible = members.filter((m) => !idle || pinned.has(m.socketId));

  const sorted = [...visible].sort((a, b) => {
    const sa = pinned.has(a.socketId) ? 0 : 1;
    const sb = pinned.has(b.socketId) ? 0 : 1;
    return sa - sb || members.indexOf(a) - members.indexOf(b);
  });

  return (
    <div className="flex flex-col items-end gap-1.5">
      <AnimatePresence initial={false}>
        {sorted.map((m) => (
          <MemberRow
            key={m.socketId}
            m={m}
            speaking={speaking.includes(m.socketId)}
            expanded={pinned.has(m.socketId) || hoverId === m.socketId || members.length <= 3}
            hasMedia={memberHasMedia(m, remoteStreams)}
            onHover={setHoverId}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}