export type AccentKey = "amber" | "violet" | "rose" | "info" | "success";
export type FontKey = "sans" | "serif" | "mono";

export interface ThemePrefs {
  accent: AccentKey;
  glow: number;   // 0..100
  dim: number;    // 0..100
  blur: number;   // 8..20 px
  font: FontKey;
}

export const ACCENTS: Record<AccentKey, { amber: string; violet: string; rose: string }> = {
  amber:   { amber: "#E0A458", violet: "#9B7BB8", rose: "#C98A8A" },
  violet:  { amber: "#9B7BB8", violet: "#7E5F9E", rose: "#C98A8A" },
  rose:    { amber: "#C98A8A", violet: "#9B7BB8", rose: "#B96E6E" },
  info:    { amber: "#8FA6C9", violet: "#9B7BB8", rose: "#C98A8A" },
  success: { amber: "#7FAE8B", violet: "#9B7BB8", rose: "#C98A8A" },
};

export const FONT_STACKS: Record<FontKey, string> = {
  sans:  "var(--font-geist-sans), system-ui, sans-serif",
  serif: "var(--font-serif-preset), ui-serif, Georgia, serif",
  mono:  "var(--font-mono-preset), ui-monospace, 'SF Mono', monospace",
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function applyTheme(t: ThemePrefs): void {
  const el = document.documentElement;
  const c = ACCENTS[t.accent];
  el.style.setProperty("--accent-amber", c.amber);
  el.style.setProperty("--accent-violet", c.violet);
  el.style.setProperty("--accent-rose", c.rose);
  el.style.setProperty("--glow", `${clamp(t.glow, 0, 100)}%`);
  el.style.setProperty("--dim", `${clamp(t.dim, 0, 100)}%`);
  el.style.setProperty("--blur", `${clamp(t.blur, 8, 20)}px`);
  el.style.setProperty("--font-display", FONT_STACKS[t.font]);
}