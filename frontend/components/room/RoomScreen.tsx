"use client";
import { useEffect } from "react";
import { useParams } from "next/navigation";
import { ChromeReveal } from "@/components/room/ChromeReveal";
import { TitleChip } from "@/components/room/TitleChip";
import { SongWidget } from "@/components/room/SongWidget";
import { UsersStack } from "@/components/room/UsersStack";
import { ControlsCluster } from "@/components/room/ControlsCluster";
import { TimerCenter } from "@/components/room/TimerCenter";
import { ToastStack } from "@/components/room/ToastStack";
import { ReconnectOverlay } from "@/components/room/ReconnectOverlay";
import { ErrorPage } from "@/components/room/ErrorPage";
import { getSocket } from "@/lib/socket";
import { useRoomStore } from "@/lib/store";
import { loadPrefs } from "@/lib/prefs";
import { initRtc, startSpeakingDetection } from "@/lib/rtc";

export function RoomScreen({ roomId: propRoomId }: { roomId: string }) {
  const params = useParams<{ roomId: string }>();
  const roomId = propRoomId || (params?.roomId as string) || "";

  const state = useRoomStore((s) => s.state);
  const connected = useRoomStore((s) => s.connected);
  const error = useRoomStore((s) => s.error);

  useEffect(() => {
    const socket = getSocket();
    const storeRoomId = useRoomStore.getState().roomId;
    console.debug("[solace:FE] RoomScreen mount", {
      roomId,
      socketConnected: socket.connected,
      socketId: socket.id,
      storeRoomId,
    });

    const apply = (event: string) => (payload: unknown) => useRoomStore.getState().applyEvent(event, payload);
    const ons: [string, (p: unknown) => void][] = [
      ["room:joined", apply("room:joined")],
      ["room:created", apply("room:created")],
      ["room:member_joined", apply("room:member_joined")],
      ["room:member_left", apply("room:member_left")],
      ["room:activity", apply("room:activity")],
      ["room:title_state", apply("room:title_state")],
      ["playback:state", apply("playback:state")],
      ["wallpaper:state", apply("wallpaper:state")],
      ["wallpaper:uploads", apply("wallpaper:uploads")],
      ["timer:state", apply("timer:state")],
      ["room:error", apply("room:error")],
      ["rtc:media_state", apply("rtc:media_state")],
    ];
    console.debug("[solace:FE] RoomScreen listeners registered", ons.map(([n]) => n));
    ons.forEach(([n, f]) => socket.on(n, f as never));
    socket.on("connect", () => {
      useRoomStore.getState().setConnected(true);
      useRoomStore.getState().setSocketId(socket.id ?? null);
    });
    socket.on("disconnect", () => {
      useRoomStore.getState().setConnected(false);
      useRoomStore.getState().setSocketId(null);
    });

    // socket singleton may already be connected (join/create flow) — sync immediately
    if (socket.connected) {
      useRoomStore.getState().setConnected(true);
      useRoomStore.getState().setSocketId(socket.id ?? null);
    }

    // init RTC + speaking detection once per mount
    initRtc();
    startSpeakingDetection();

    // join (also covers reloads: rejoin replays snapshot via room:joined)
    if (useRoomStore.getState().roomId !== roomId) {
      const prefs = loadPrefs();
      console.debug("[solace:FE] RoomScreen join emit", { roomId, displayName: prefs.name, hasAvatar: !!prefs.avatar });
      socket.emit("room:join", { roomId, displayName: prefs.name, avatar: prefs.avatar });
    } else {
      console.debug("[solace:FE] RoomScreen skip join (store already hydrated)", { roomId });
    }

    return () => {
      ons.forEach(([n, f]) => socket.off(n, f as never));
    };
  }, [roomId]);

  if (error?.code === "ROOM_NOT_FOUND" || error?.code === "ROOM_FULL") {
    return <ErrorPage code={error.code} />;
  }

  const wallpaper = state.wallpaper;

  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* wallpaper layer — full bleed */}
      <div className="absolute inset-0">
        {wallpaper.url ? (
          wallpaper.kind === "video" ? (
            <video src={wallpaper.url} muted loop playsInline autoPlay className="w-full h-full object-cover" />
          ) : (
            <img src={wallpaper.url} alt="" className="w-full h-full object-cover" />
          )
        ) : (
          <div className="wallpaper w-full h-full" />
        )}
      </div>

      {/* chrome corners */}
      <ChromeReveal className="absolute top-4 left-5 z-20"><TitleChip /></ChromeReveal>
      <ChromeReveal className="absolute top-4 right-5 z-20"><UsersStack /></ChromeReveal>
      <ChromeReveal className="absolute bottom-4 left-5 z-20"><SongWidget /></ChromeReveal>
      <ChromeReveal className="absolute bottom-4 right-5 z-20">
        <ControlsCluster />
        <ToastStack />
      </ChromeReveal>

      {/* timer center-top — special handling: hint persists when minimized+running */}
      <TimerCenter />

      {/* overlays */}
      <ReconnectOverlay visible={!connected} />
    </main>
  );
}