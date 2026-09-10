export const GRADIENT_PREFIX = "gradient:";

export type GradientPreset = { id: string; label: string; css: string };

export const GRADIENTS: GradientPreset[] = [
  { id: "embers", label: "embers", css: "linear-gradient(160deg,#3b1d1a 0%,#c46a3b 55%,#2a1410 100%)" },
  { id: "ocean", label: "ocean", css: "linear-gradient(160deg,#0c1a2b 0%,#2b6a8a 60%,#0a1522 100%)" },
  { id: "forest", label: "forest", css: "linear-gradient(160deg,#0f1f14 0%,#3a6b4f 60%,#0b1710 100%)" },
];

export function isGradientUrl(url: string | null | undefined): boolean {
  return !!url && url.startsWith(GRADIENT_PREFIX);
}

export function gradientCss(url: string | null | undefined): string | null {
  if (!url || !url.startsWith(GRADIENT_PREFIX)) return null;
  const id = url.slice(GRADIENT_PREFIX.length);
  const preset = GRADIENTS.find((g) => g.id === id);
  return preset?.css ?? null;
}
