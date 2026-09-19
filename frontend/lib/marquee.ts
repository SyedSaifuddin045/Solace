"use client";
import { useEffect, useRef, useState } from "react";

/** Gap between marquee copies — must match `.marquee-item` padding-right. */
export const MARQUEE_GAP_PX = 40;

/**
 * Reports whether a single-line element's content overflows its box, plus
 * the width one loop must travel. Measures on mount and on any resize or
 * text mutation — a marquee should only animate when a title is too long.
 */
export function useMarquee<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [overflowing, setOverflowing] = useState(false);
  // Drives scroll speed so every title moves at the same perceived pace.
  const [contentWidth, setContentWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const check = () => {
      const node = ref.current;
      if (!node) return;
      // +1 slop: subpixel rounding should not flip a title into marquee mode.
      setOverflowing(node.scrollWidth > node.clientWidth + 1);
      // In marquee mode the track holds two copies, so measure ONE item —
      // measuring the host would double and feed back into the duration.
      const item = node.querySelector<HTMLElement>(".marquee-item");
      setContentWidth(item ? item.scrollWidth : node.scrollWidth + MARQUEE_GAP_PX);
    };

    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    // Title text can change without the box resizing (queue advance), so
    // also watch content mutations.
    const mo = new MutationObserver(check);
    mo.observe(el, { childList: true, subtree: true, characterData: true });

    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, []);

  return { ref, overflowing, contentWidth };
}