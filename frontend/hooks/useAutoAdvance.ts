import { useEffect, useRef } from "react";
import { useRoomStore } from "@/lib/store";
import { getSocket } from "@/lib/socket";
import { getAudioElement } from "@/components/room/VideoPlayer";

export function useAutoAdvance() {
  const track = useRoomStore((s) => s.state.playback.track);
  const status = useRoomStore((s) => s.state.playback.status);
  const queue = useRoomStore((s) => s.state.queue);
  const advancedRef = useRef(false);

  // Auto-play from queue when no track is playing
  useEffect(() => {
    if (status !== "playing" && !track && queue.length > 0) {
      getSocket().emit("playback:set_track", { track: queue[0] });
      getSocket().emit("playback:queue_remove", { index: 0 });
      getSocket().emit("playback:play");
    }
  }, [status, track, queue]);

  // Detect track end via audio element and advance
  useEffect(() => {
    if (status !== "playing") return;
    const audio = getAudioElement();
    if (!audio) return;

    advancedRef.current = false;

    const handleEnded = () => {
      if (advancedRef.current) return;
      advancedRef.current = true;
      const q = useRoomStore.getState().state.queue;
      if (q.length > 0) {
        getSocket().emit("playback:set_track", { track: q[0] });
        getSocket().emit("playback:queue_remove", { index: 0 });
        getSocket().emit("playback:play");
      } else {
        getSocket().emit("playback:pause");
      }
    };

    audio.addEventListener("ended", handleEnded);
    return () => audio.removeEventListener("ended", handleEnded);
  }, [status, track]);
}
