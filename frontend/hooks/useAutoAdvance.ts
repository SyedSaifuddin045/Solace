import { useEffect } from "react";
import { useRoomStore } from "@/lib/store";
import { getSocket } from "@/lib/socket";

export function useAutoAdvance() {
  const track = useRoomStore((s) => s.state.playback.track);
  const status = useRoomStore((s) => s.state.playback.status);
  const position = useRoomStore((s) => s.state.playback.position);
  const updatedAt = useRoomStore((s) => s.state.playback.updatedAt);
  const queue = useRoomStore((s) => s.state.queue);

  useEffect(() => {
    if (status !== "playing" || !track?.duration) return;

    const elapsed = (Date.now() - updatedAt) / 1000;
    const remaining = track.duration - position - elapsed;
    if (remaining <= 0 && queue.length > 0) {
      // Track ended — advance
      getSocket().emit("playback:queue_remove", { index: 0 });
      getSocket().emit("playback:set_track", { track: queue[0] });
      getSocket().emit("playback:play");
    }
  }, [status, position, updatedAt, track, queue]);
}
