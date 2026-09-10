"use client";
import { type ReactNode } from "react";
import { useIdle } from "@/hooks/useIdle";

export function ChromeReveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  const idle = useIdle();
  const host = typeof window !== "undefined" ? !window.matchMedia("(prefers-reduced-motion: reduce)").matches : true;
  return (
    <div className={`chrome ${idle ? "chrome-hidden" : ""} ${className}`} style={host ? undefined : { transform: "none" }}>
      {children}
    </div>
  );
}