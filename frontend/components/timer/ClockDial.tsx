"use client";
import { useCallback, useRef, useState } from "react";

interface ClockDialProps {
  value: number;
  onChange: (minutes: number) => void;
  label?: string;
}

const PRESETS = [15, 25, 45, 60, 90];
const MINUTES = 180;
const CX = 110;
const CY = 110;
const RING_R = 95;

const minutesToAngle = (m: number) => (m / MINUTES) * 2 * Math.PI;
const angleToMinutes = (a: number) => Math.round((a / (2 * Math.PI)) * MINUTES);
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function posOnRing(angle: number, r: number = RING_R) {
  return { x: CX + r * Math.sin(angle), y: CY - r * Math.cos(angle) };
}

export function ClockDial({ value, onChange, label }: ClockDialProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState(false);

  const snap = useCallback((mins: number) => {
    const a = minutesToAngle(mins);
    for (const p of PRESETS) {
      if (Math.abs(a - minutesToAngle(p)) <= (3 * Math.PI) / 180) return p;
    }
    return mins;
  }, []);

  const resolveFromPointer = useCallback(
    (e: React.PointerEvent | PointerEvent) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const scale = 220 / rect.width;
      const dx = (e.clientX - rect.left) * scale - CX;
      const dy = (e.clientY - rect.top) * scale - CY;
      let a = Math.atan2(dx, -dy);
      if (a < 0) a += 2 * Math.PI;
      onChange(clamp(snap(angleToMinutes(a)), 1, MINUTES));
    },
    [onChange, snap],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      (e.target as Element).setPointerCapture(e.pointerId);
      setDragging(true);
      resolveFromPointer(e);
    },
    [resolveFromPointer],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (dragging) resolveFromPointer(e);
    },
    [dragging, resolveFromPointer],
  );

  const onPointerUp = useCallback(() => setDragging(false), []);

  const angle = minutesToAngle(value);
  const tip = posOnRing(angle);
  const activePreset = PRESETS.reduce(
    (best, p) => (Math.abs(value - p) < Math.abs(value - best) ? p : best),
    PRESETS[0],
  );

  return (
    <div
      className="flex flex-col items-center"
      style={{
        animation: "clockDialIn 200ms ease-out both",
      }}
    >
      {label && (
        <span className="text-[10px] opacity-50 uppercase tracking-widest mb-2">
          {label}
        </span>
      )}
      <svg
        ref={svgRef}
        viewBox="0 0 220 220"
        className="select-none touch-none"
        style={{ width: "100%", maxWidth: 220 }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <style>{`
          @keyframes clockDialIn {
            from { opacity: 0; transform: scale(0.9); }
            to   { opacity: 1; transform: scale(1); }
          }
        `}</style>

        {/* glass ring background */}
        <circle
          cx={CX}
          cy={CY}
          r={RING_R}
          fill="rgba(237,224,210,0.06)"
          stroke="var(--accent-amber)"
          strokeOpacity={0.2}
          strokeWidth={2}
        />

        {/* tick marks */}
        {Array.from({ length: 12 }, (_, i) => {
          const m = (i + 1) * 15;
          const a = minutesToAngle(m);
          const isPreset = PRESETS.includes(m);
          const isActive = m === activePreset;
          const len = isPreset ? 14 : 10;
          const outer = posOnRing(a);
          const inner = posOnRing(a, RING_R - len);
          return (
            <line
              key={m}
              x1={outer.x}
              y1={outer.y}
              x2={inner.x}
              y2={inner.y}
              stroke="var(--accent-amber)"
              strokeOpacity={isActive ? 1 : 0.3}
              strokeWidth={isPreset ? 2 : 1}
              strokeLinecap="round"
            />
          );
        })}

        {/* active tick glow */}
        {(() => {
          const a = minutesToAngle(activePreset);
          const outer = posOnRing(a);
          const inner = posOnRing(a, RING_R - 14);
          return (
            <line
              x1={outer.x}
              y1={outer.y}
              x2={inner.x}
              y2={inner.y}
              stroke="var(--accent-amber)"
              strokeWidth={2}
              strokeLinecap="round"
              filter="url(#glow)"
            />
          );
        })()}

        {/* hand */}
        <line
          x1={CX}
          y1={CY}
          x2={tip.x}
          y2={tip.y}
          stroke="var(--accent-amber)"
          strokeWidth={2}
          strokeLinecap="round"
          filter="url(#glow)"
        />

        {/* tip dot */}
        <circle cx={tip.x} cy={tip.y} r={6} fill="var(--accent-amber)" filter="url(#glow)" />

        {/* center dot */}
        <circle cx={CX} cy={CY} r={3} fill="var(--accent-amber)" fillOpacity={0.6} />

        <defs>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="var(--accent-amber)" floodOpacity="1" />
          </filter>
        </defs>
      </svg>

      {/* center label */}
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        style={{ color: "var(--accent-amber)" }}
      >
        <span className="text-xl font-light tracking-wide">
          {value} min
        </span>
      </div>
    </div>
  );
}
