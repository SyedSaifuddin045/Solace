export type ActivityKind = "chat" | "playback" | "wallpaper" | "title" | "media" | "timer" | "system";

const VALID: ActivityKind[] = ["chat", "playback", "wallpaper", "title", "media", "timer", "system"];

export function activityPresentation(type: string): { kind: ActivityKind } {
  const t = type as ActivityKind;
  return { kind: VALID.includes(t) ? t : "system" };
}
