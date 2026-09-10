"use client";
import { useEffect, useRef, useState } from "react";
import { PipWindow } from "@/components/video/PipWindow";
import { useRoomStore } from "@/lib/store";

function RemoteVideo({ stream }: { stream: MediaStream | null }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && stream) ref.current.srcObject = stream;
  }, [stream]);
  return <video ref={ref} autoPlay playsInline className="w-full h-full object-cover" />;
}

export function VideoFeed({ socketId, memberName }: { socketId: string; memberName: string }) {
  const stream = useRoomStore((s) => s.remoteStreams[socketId]);
  const [detached, setDetached] = useState(false);

  if (detached) {
    return (
      <PipWindow title={memberName} onReDock={() => setDetached(false)}>
        <RemoteVideo stream={stream ?? null} />
      </PipWindow>
    );
  }

  return (
    <div
      className="relative rounded-lg overflow-hidden"
      style={{ width: 120, height: 90, border: "1px solid rgba(224,164,88,0.3)" }}
      onDoubleClick={() => setDetached(true)}
      title="double-click to detach"
    >
      {stream ? (
        <RemoteVideo stream={stream} />
      ) : (
        <div className="w-full h-full grid place-items-center text-[8px] opacity-50">connecting…</div>
      )}
    </div>
  );
}