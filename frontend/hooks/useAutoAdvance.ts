import { useEffect, useRef } from "react";
import { useRoomStore } from "@/lib/store";
import { getSocket } from "@/lib/socket";
import { getAudioElement, getPlaybackEngine } from "@/components/room/VideoPlayer";

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

  // Detect track end and advance. Proxied stream mode fires the audio
  // element's `ended`; embed fallback mode dispatches `solace:track-ended`
  // from the hidden YT iframe (there is no audio element to listen to).
  useEffect(() => {
    if (status !== "playing") return;
    const audio = getAudioElement();

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
        // Pause WITH the real end position — a bare `playback:pause` leaves
        // the canonical position at its last snapshot (often 0 for a long
        // track), so every client snaps the progress bar back to that stale
        // timestamp instead of staying at the end.
        const pos = getPlaybackEngine()?.currentTime ?? 0;
        getSocket().emit("playback:pause", { position: pos });
      }
    };

    audio?.addEventListener("ended", handleEnded);
    window.addEventListener("solace:track-ended", handleEnded);
    return () => {
      audio?.removeEventListener("ended", handleEnded);
      window.removeEventListener("solace:track-ended", handleEnded);
    };
  }, [status, track]);
}
