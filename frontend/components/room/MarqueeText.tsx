"use client";
import { useMarquee, MARQUEE_GAP_PX } from "@/lib/marquee";

/**
 * Single-line title that scrolls horizontally (classic one-way marquee)
 * when the text overflows its box; renders plain when it fits.
 *
 * Seamless loop: the text is duplicated inside a flex track; the keyframe
 * translates the track by -50% (exactly one copy + gap) and repeats.
 * Pauses while hovered. Honors prefers-reduced-motion (no animation).
 */
export function MarqueeText({ text, className }: { text: string; className?: string }) {
  const { ref, overflowing, contentWidth } = useMarquee<HTMLParagraphElement>();

  if (!overflowing) {
    return (
      <p ref={ref} className={className} title={text}>
        {text}
      </p>
    );
  }

  // Constant perceived speed: one loop travels the content width (already
  // includes the inter-copy gap). Falls back to a length estimate pre-measure.
  const distance = contentWidth > 0 ? contentWidth : text.length * 6 + MARQUEE_GAP_PX;
  const duration = `${Math.min(30, Math.max(6, distance / 35)).toFixed(1)}s`;

  return (
    <p ref={ref} className={`${className ?? ""} marquee`} title={text}>
      <span className="marquee-inner" style={{ ["--marquee-duration" as string]: duration }}>
        <span className="marquee-item">{text}</span>
        <span className="marquee-item" aria-hidden="true">
          {text}
        </span>
      </span>
    </p>
  );
}