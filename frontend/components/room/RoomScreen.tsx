"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ChromeReveal } from "@/components/room/ChromeReveal";
import { TitleChip } from "@/components/room/TitleChip";
import { SongWidget } from "@/components/room/SongWidget";
import { UsersStack } from "@/components/room/UsersStack";
import { ControlsCluster, MediaControls, type PanelKind } from "@/components/room/ControlsCluster";
import { ChatPanel } from "@/components/panels/ChatPanel";
import { InfoPanel } from "@/components/panels/InfoPanel";
import { ThemePanel } from "@/components/panels/ThemePanel";
import { WallpaperPanel } from "@/components/panels/WallpaperPanel";
import { TrackPicker } from "@/components/room/TrackPicker";
import { QueuePanel } from "@/components/room/QueuePanel";
import { TimerCenter } from "@/components/room/TimerCenter";
import { ToastStack } from "@/components/room/ToastStack";
import { ReconnectOverlay } from "@/components/room/ReconnectOverlay";
import { ErrorPage } from "@/components/room/ErrorPage";
import { RoomSetupOverlay } from "@/components/room/RoomSetupOverlay";
import { getSocket } from "@/lib/socket";
import { useRoomStore } from "@/lib/store";
import { loadPrefs } from "@/lib/prefs";
import { initRtc, startSpeakingDetection, stopRtc } from "@/lib/rtc";
import { resolveAssetUrl } from "@/lib/upload";
import { isGradientUrl, gradientCss } from "@/lib/wallpaper";
import { useAutoAdvance } from "@/hooks/useAutoAdvance";
import { AudioPlayer } from "@/components/room/VideoPlayer";

export function RoomScreen({ roomId: propRoomId }: { roomId: string }) {
  const params = useParams<{ roomId: string }>();
  const roomId = propRoomId || (params?.roomId as string) || "";

  const state = useRoomStore((s) => s.state);
  const connected = useRoomStore((s) => s.connected);
  const error = useRoomStore((s) => s.error);

  const [setupVisible, setSetupVisible] = useState(false);
  const [activePanel, setActivePanel] = useState<PanelKind | "none">("none");
  const [panelOpen, setPanelOpen] = useState(false);
  const [trackPickerOpen, setTrackPickerOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);

  useAutoAdvance();

  useEffect(() => {
    // client-only mount check per spec: show setup overlay before entering
    if (typeof window !== "undefined" && sessionStorage.getItem("solace:setup") === "1") {
      console.debug("[solace:FE] RoomScreen setup flag detected");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSetupVisible(true);
    }
  }, []);

  const handleSetupEnter = () => {
    sessionStorage.removeItem("solace:setup");
    console.debug("[solace:FE] RoomScreen setup completed");
    setSetupVisible(false);
  };

  useEffect(() => {
    if (activePanel !== "none") {
      requestAnimationFrame(() => setPanelOpen(true));
    } else {
      setPanelOpen(false);
    }
  }, [activePanel]);

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
      stopRtc();
    };
  }, [roomId]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      stopRtc();
      getSocket().emit("room:leave");
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  if (error?.code === "ROOM_NOT_FOUND" || error?.code === "ROOM_FULL") {
    return <ErrorPage code={error.code} />;
  }

  const wallpaper = state.wallpaper;

  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* wallpaper layer — full bleed */}
      <div className="absolute inset-0">
        {isGradientUrl(wallpaper.url) ? (
          (() => {
            const css = gradientCss(wallpaper.url);
            return css ? (
              <div className="w-full h-full" style={{ background: css }} />
            ) : (
              <div className="wallpaper w-full h-full" />
            );
          })()
        ) : wallpaper.url ? (
          wallpaper.kind === "video" ? (
            <video src={resolveAssetUrl(wallpaper.url) ?? undefined} muted loop playsInline autoPlay className="w-full h-full object-cover" />
          ) : (
            <img src={resolveAssetUrl(wallpaper.url) ?? undefined} alt="" className="w-full h-full object-cover" />
          )
        ) : (
          <div className="wallpaper w-full h-full" />
        )}
      </div>

      {/* chrome corners */}
      <ChromeReveal className="absolute top-3 sm:top-4 left-3 sm:left-5 z-20"><TitleChip /></ChromeReveal>
      <div
        className="transition-transform duration-300 ease-out"
        style={{ transform: activePanel !== "none" ? "translateX(-25rem)" : "translateX(0)" }}
      >
        <ChromeReveal className="absolute top-3 sm:top-4 right-3 sm:right-5 z-20"><UsersStack /></ChromeReveal>
      </div>
      {/* bottom controls — single render, shift left when panel opens */}
      <div className="absolute bottom-0 left-0 right-0 p-4 flex justify-between items-end z-20 flex-row gap-3">
        <ChromeReveal className="shrink-0 max-w-[40%]"><SongWidget onOpenPicker={() => setTrackPickerOpen(true)} onOpenQueue={() => setQueueOpen(true)} /></ChromeReveal>

        {/* media controls — bottom center, shifts with panel */}
        <div
          className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-auto transition-[left] duration-300 ease-out"
          style={{ left: activePanel !== "none" ? "calc(50% - 12.5rem)" : "50%" }}
        >
          <MediaControls />
        </div>

        <ChromeReveal className="shrink-0 max-w-[60%]">
          <div
            className="flex flex-col items-end gap-1.5 transition-transform duration-300 ease-out hidden sm:flex"
            style={{ transform: activePanel !== "none" ? "translateX(-25rem)" : "translateX(0)" }}
          >
            <ToastStack />
            <ControlsCluster activePanel={activePanel} onOpenPanel={(p) => setActivePanel(p)} />
          </div>
        </ChromeReveal>
      </div>

      {/* timer center-top — centers in available space when panel opens */}
      <div
        className="absolute top-0 left-0 pointer-events-none transition-[right] duration-300 ease-out"
        style={{ right: activePanel !== "none" ? "25rem" : "0" }}
      >
        <TimerCenter />
      </div>

      {/* panels — rendered at top level outside ChromeReveal z-stack */}
      {activePanel !== "none" && (
        <>
          <div
            className="fixed inset-y-0 right-0 w-full max-w-sm glass z-30 flex flex-col"
            style={{
              background: "rgba(26,22,20,0.92)",
              transform: panelOpen ? "translateX(0)" : "translateX(100%)",
              transition: "transform 300ms ease-out",
            }}
          >
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {activePanel === "chat" && <ChatPanel onClose={() => setActivePanel("none")} />}
              {activePanel === "info" && <InfoPanel onClose={() => setActivePanel("none")} />}
              {activePanel === "theme" && <ThemePanel onClose={() => setActivePanel("none")} />}
              {activePanel === "wallpaper" && <WallpaperPanel onClose={() => setActivePanel("none")} />}
            </div>
          </div>
        </>
      )}

      {/* overlays */}
      <ReconnectOverlay visible={!connected} />

      {/* track picker */}
      {trackPickerOpen && <TrackPicker onClose={() => setTrackPickerOpen(false)} />}

      {/* queue panel */}
      {queueOpen && (
        <div className="fixed inset-0 z-30 grid place-items-center" style={{ background: "rgba(20,17,15,0.85)" }} onClick={() => setQueueOpen(false)}>
          <div onClick={(e) => e.stopPropagation()}>
            <QueuePanel onClose={() => setQueueOpen(false)} />
          </div>
        </div>
      )}

      {/* setup overlay */}
      {setupVisible && <RoomSetupOverlay onEnter={handleSetupEnter} />}

      {/* hidden audio player (YouTube) */}
      <AudioPlayer />
    </main>
  );
}