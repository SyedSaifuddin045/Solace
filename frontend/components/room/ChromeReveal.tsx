"use client";
import { type ReactNode, useState } from "react";
import { useIdle } from "@/hooks/useIdle";

export function ChromeReveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  const idle = useIdle();
  const [hovered, setHovered] = useState(false);
  const host = typeof window !== "undefined" ? !window.matchMedia("(prefers-reduced-motion: reduce)").matches : true;
  return (
    <div
      className={`chrome ${idle ? "chrome-hidden" : ""} ${className}`}
      style={{ ...(host ? {} : { transform: "none" }), ...(hovered ? { zIndex: 30 } : {}) }}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      {children}
    </div>
  );
}