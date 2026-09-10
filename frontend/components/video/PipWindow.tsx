"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import { PanelTopClose } from "lucide-react";

export function PipWindow({
  title,
  children,
  onReDock,
}: {
  title: string;
  children: React.ReactNode;
  onReDock: () => void;
}) {
  const [size, setSize] = useState({ w: 240, h: 160 });

  return (
    <motion.div
      drag
      dragMomentum={false}
      className="fixed z-40 rounded-xl overflow-hidden"
      style={{ width: size.w, height: size.h, boxShadow: "0 0 24px rgba(0,0,0,0.4)", border: "1px solid rgba(224,164,88,0.35)" }}
    >
      {children}
      <div
        className="absolute top-0 left-0 right-0 h-6 flex items-center justify-between px-2 text-[9px]"
        style={{ background: "linear-gradient(rgba(20,17,15,0.75), transparent)", cursor: "grab" }}
      >
        <span className="opacity-80 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--status-error)" }} />
          {title}
        </span>
        <button
          onDoubleClick={onReDock}
          className="opacity-60 hover:opacity-100 flex items-center gap-1 text-[8px]"
        >
          <PanelTopClose size={9} strokeWidth={1.8} /> dock
        </button>
      </div>
      <div
        className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
        onPointerDown={(e) => {
          const start = { x: e.clientX, y: e.clientY, w: size.w, h: size.h };
          const move = (ev: PointerEvent) => {
            setSize({ w: Math.max(160, start.w + ev.clientX - start.x), h: Math.max(120, start.h + ev.clientY - start.y) });
          };
          const up = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
          };
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", up);
        }}
      />
    </motion.div>
  );
}