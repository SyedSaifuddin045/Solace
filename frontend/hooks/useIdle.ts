import { useEffect, useRef, useState } from "react";

export function useIdle(timeoutMs = 5000): boolean {
  const [idle, setIdle] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const reset = () => {
      setIdle(false);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setIdle(true), timeoutMs);
    };
    window.addEventListener("mousemove", reset);
    window.addEventListener("keydown", reset);
    // Touch devices never fire mousemove/keydown — without these the chrome
    // would lock itself hidden 5s after load on mobile.
    window.addEventListener("pointerdown", reset);
    window.addEventListener("touchstart", reset, { passive: true });
    window.addEventListener("touchmove", reset, { passive: true });
    // start the clock immediately (page load counts as activity)
    reset();
    return () => {
      window.removeEventListener("mousemove", reset);
      window.removeEventListener("keydown", reset);
      window.removeEventListener("pointerdown", reset);
      window.removeEventListener("touchstart", reset);
      window.removeEventListener("touchmove", reset);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [timeoutMs]);

  return idle;
}