import { applyTheme, type ThemePrefs } from "@/lib/theme";

export interface Prefs {
  name: string;
  avatar: string | null;      // data URL only (capped), null = initials
  theme: ThemePrefs;
  recentRooms: string[];      // max 5
}

export const KEY = "solace.prefs";

export const DEFAULT_PREFS: Prefs = {
  name: "",
  avatar: null,
  theme: { accent: "amber", glow: 100, dim: 55, blur: 14, font: "sans" },
  recentRooms: [],
};

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      ...DEFAULT_PREFS,
      ...parsed,
      name: typeof parsed.name === "string" ? parsed.name.slice(0, 24) : DEFAULT_PREFS.name,
      avatar: typeof parsed.avatar === "string" ? parsed.avatar : null,
      recentRooms: Array.isArray(parsed.recentRooms) ? parsed.recentRooms.slice(0, 5) : [],
      theme: { ...DEFAULT_PREFS.theme, ...(parsed.theme ?? {}) },
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(p: Prefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // quota exceeded / private mode — prefer-session fallback silently
  }
}

export function touchRecentRoom(roomId: string): void {
  const p = loadPrefs();
  p.recentRooms = [roomId, ...p.recentRooms.filter((r) => r !== roomId)].slice(0, 5);
  savePrefs(p);
}

export function initTheme(): void {
  applyTheme(loadPrefs().theme);
}