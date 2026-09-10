"use client";
import { useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

const MAX_AVATAR_BYTES = 256_000; // cap agrees with CONTRACT-DELTAS (data URL)

export function AvatarPicker({
  value,
  onChange,
  size = 48,
}: {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  size?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const read = (file: File | undefined) => {
    setError(null);
    if (!file) return;
    if (file.size > MAX_AVATAR_BYTES) {
      setError("Max 256 KB");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("Image only");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      onChange(dataUrl.length > MAX_AVATAR_BYTES * 2 ? null : dataUrl); // base64 ≈ 1.37x binary; guard anyway
    };
    reader.readAsDataURL(file);
  };

  const initials = (v: string | null) => (v ? v.slice(0, 2).toUpperCase() : "?");

  return (
    <div className="flex items-center gap-3">
      <div className="group relative flex justify-center" style={{ width: size, height: size }}>
        <div
          className="w-full h-full rounded-full grid place-items-center font-semibold text-[13px] overflow-hidden"
          style={{ background: value ? "transparent" : "var(--accent-amber)", color: "#14110F" }}
        >
          {value ? <img src={value} alt="avatar" className="w-full h-full object-cover" /> : initials(value ?? "")}
        </div>
        <button
          type="button"
          aria-label="Change avatar"
          onClick={() => inputRef.current?.click()}
          className="absolute inset-0 rounded-full grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity text-[10px]"
          style={{ background: "rgba(20,17,15,0.7)", color: "var(--accent-bone)" }}
        >
          <RefreshCw size={12} /> change
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => read(e.target.files?.[0])}
      />
      {error && <span className="text-[10px]" style={{ color: "var(--status-error)" }}>{error}</span>}
    </div>
  );
}