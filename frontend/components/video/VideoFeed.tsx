"use client";
import { useEffect, useRef, useState } from "react";
import { PipWindow } from "@/components/video/PipWindow";
import { useRoomStore } from "@/lib/store";

function RemoteStream({ stream }: { stream: MediaStream }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hasVideo = stream.getVideoTracks().length > 0;

  useEffect(() => {
    if (audioRef.current) audioRef.current.srcObject = stream;
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream, hasVideo]);

  return (
    <>
      <audio ref={audioRef} autoPlay playsInline className="hidden" />
      {hasVideo ? (
        <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full grid place-items-center text-[8px] opacity-60">audio only</div>
      )}
    </>
  );
}

export function VideoFeed({ socketId, memberName }: { socketId: string; memberName: string }) {
  const stream = useRoomStore((s) => s.remoteStreams[socketId]);
  const [detached, setDetached] = useState(false);

  if (detached) {
    return (
      <PipWindow title={memberName} onReDock={() => setDetached(false)}>
        {stream && <RemoteStream stream={stream} />}
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
        <RemoteStream stream={stream} />
      ) : (
        <div className="w-full h-full grid place-items-center text-[8px] opacity-50">connecting…</div>
      )}
    </div>
  );
}