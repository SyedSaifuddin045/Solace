"use client";
import { useEffect, useRef, useState } from "react";
import { PipWindow } from "@/components/video/PipWindow";
import { useRoomStore } from "@/lib/store";

function RemoteStream({ stream }: { stream: MediaStream }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  // Presence-based init: remote tracks can arrive muted/blank at stream
  // creation — a muted track STILL has (soon-arriving) video, so show the
  // element immediately. Listeners narrow it to 'audio only' on mute/ended.
  const [videoActive, setVideoActive] = useState(() => stream.getVideoTracks().length > 0);

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
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className={`w-full h-full object-cover ${videoActive ? "" : "hidden"}`}
      />
      {!videoActive && (
        <div className="w-full h-full grid place-items-center text-[8px] opacity-60">audio only</div>
      )}
    </>
  );
}

/** Docked feed tile — double-click detaches into a floating PiP window. */
export function VideoFeed({ socketId, memberName }: { socketId: string; memberName: string }) {
  const stream = useRoomStore((s) => s.remoteStreams[socketId]);
  const detached = useRoomStore((s) => s.detachedFeed?.socketId === socketId);

  if (detached) return null;

  return (
    <div
      className="relative rounded-lg overflow-hidden"
      style={{ width: 120, height: 90, border: "1px solid rgba(224,164,88,0.3)" }}
      onDoubleClick={() => useRoomStore.getState().detachFeed(socketId, memberName)}
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

/**
 * The undocked (PiP) feed. Mounted OUTSIDE any idle/hover chrome in RoomScreen
 * so it never fades or hides — an undocked video stays visible forever.
 */
export function DetachedVideoWindow() {
  const detachedFeed = useRoomStore((s) => s.detachedFeed);
  const stream = useRoomStore((s) => (detachedFeed ? s.remoteStreams[detachedFeed.socketId] : null));

  if (!detachedFeed) return null;

  return (
    <PipWindow title={detachedFeed.title} onReDock={() => useRoomStore.getState().dockFeed()}>
      {stream ? (
        <RemoteStream stream={stream} />
      ) : (
        <div className="w-full h-full grid place-items-center text-[8px] opacity-50">connecting…</div>
      )}
    </PipWindow>
  );
}