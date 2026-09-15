"use client";
import { useEffect, useRef, useState } from "react";
import { PipWindow } from "@/components/video/PipWindow";
import { useRoomStore } from "@/lib/store";

function RemoteStream({ stream }: { stream: MediaStream }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoActive, setVideoActive] = useState(() =>
    stream.getVideoTracks().some((t) => t.readyState === "live" && !t.muted)
  );

  useEffect(() => {
    if (audioRef.current) audioRef.current.srcObject = stream;
    if (videoRef.current) videoRef.current.srcObject = stream;
    const videoTracks = stream.getVideoTracks();
    const update = () =>
      setVideoActive(videoTracks.some((t) => t.readyState === "live" && !t.muted));
    videoTracks.forEach((t) => {
      t.addEventListener("mute", update);
      t.addEventListener("unmute", update);
      t.addEventListener("ended", update);
    });
    update();
    return () => {
      videoTracks.forEach((t) => {
        t.removeEventListener("mute", update);
        t.removeEventListener("unmute", update);
        t.removeEventListener("ended", update);
      });
    };
  }, [stream]);

  return (
    <>
      <audio ref={audioRef} autoPlay playsInline className="hidden" />
      {videoActive ? (
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