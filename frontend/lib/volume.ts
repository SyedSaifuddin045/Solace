const KEY = "solace-volume";

/** Load persisted volume (0–1). Personal, never synced to the room. */
export function loadVolume(): number {
  if (typeof window === "undefined") return 1;
  const raw = window.localStorage.getItem(KEY);
  if (raw === null) return 1;
  const v = Number.parseFloat(raw);
  if (!Number.isFinite(v)) return 1;
  return Math.min(1, Math.max(0, v));
}

export function saveVolume(volume: number): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, String(Math.min(1, Math.max(0, volume))));
}