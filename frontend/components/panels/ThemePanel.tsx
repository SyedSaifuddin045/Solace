"use client";
import { useState } from "react";
import { X } from "lucide-react";
import { ACCENTS, applyTheme, FONT_STACKS, type AccentKey, type FontKey } from "@/lib/theme";
import { DEFAULT_PREFS, loadPrefs, savePrefs } from "@/lib/prefs";

const ACCENT_LABEL: Record<AccentKey, string> = { amber: "amber", violet: "violet", rose: "rose", info: "slate", success: "moss" };

export function ThemePanel({ onClose }: { onClose: () => void }) {
  const [theme, setTheme] = useState(() => loadPrefs().theme);

  const apply = (next: typeof theme) => {
    setTheme(next);
    applyTheme(next);
    const p = loadPrefs();
    p.theme = next;
    savePrefs(p);
  };

  return (
    <div className="p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[12px]" style={{ color: "var(--accent-amber)" }}>room mood · yours only</p>
        <button aria-label="Close" onClick={onClose}><X size={14} className="opacity-60" /></button>
      </div>

      <p className="text-[10px] opacity-50 mb-1.5">accent</p>
      <div className="flex gap-2 mb-4">
        {(Object.keys(ACCENTS) as AccentKey[]).map((k) => (
          <button
            key={k}
            aria-label={ACCENT_LABEL[k]}
            onClick={() => apply({ ...theme, accent: k })}
            className="w-7 h-7 rounded-full"
            style={{
              background: ACCENTS[k].amber,
              boxShadow: theme.accent === k ? "0 0 0 2px var(--depth-0), 0 0 0 4px var(--accent-amber)" : undefined,
            }}
          />
        ))}
      </div>

      <Slider label="glow" value={theme.glow} onChange={(v) => apply({ ...theme, glow: v })} />
      <Slider label="wallpaper dim" value={theme.dim} onChange={(v) => apply({ ...theme, dim: v })} />
      <Slider label="glass blur" value={theme.blur} min={8} max={20} onChange={(v) => apply({ ...theme, blur: v })} />

      <p className="text-[10px] opacity-50 mb-1.5 mt-4">type</p>
      <div className="flex gap-2">
        {(Object.keys(FONT_STACKS) as FontKey[]).map((f) => (
          <button key={f} onClick={() => apply({ ...theme, font: f })} className="hairline rounded-full px-4 py-1.5 text-[11px] capitalize"
            style={theme.font === f ? { background: "rgba(224,164,88,0.16)", color: "var(--accent-amber)" } : undefined}>
            {f}
          </button>
        ))}
      </div>

      <button onClick={() => apply({ ...DEFAULT_PREFS.theme })} className="mt-auto hairline rounded-full px-4 py-2 text-[11px] opacity-70">
        reset to default mood
      </button>
    </div>
  );
}

function Slider({ label, value, min = 0, max = 100, onChange }: { label: string; value: number; min?: number; max?: number; onChange: (v: number) => void }) {
  return (
    <div className="mb-3">
      <div className="flex justify-between text-[10px] opacity-50 mb-1"><span>{label}</span><span>{value}</span></div>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-amber" />
    </div>
  );
}