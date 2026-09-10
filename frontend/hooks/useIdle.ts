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
    // start the clock immediately (page load counts as activity)
    reset();
    return () => {
      window.removeEventListener("mousemove", reset);
      window.removeEventListener("keydown", reset);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [timeoutMs]);

  return idle;
}