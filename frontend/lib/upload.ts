import { BACKEND_URL } from "@/lib/socket";
import { httpUploadError } from "@/lib/errors";

export type WallpaperKind = "image" | "video";

/** Resolve relative upload paths against backend origin. Absolute/data/blob URLs pass through unchanged. */
export function resolveAssetUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("data:") || url.startsWith("http:") || url.startsWith("https:") || url.startsWith("blob:")) return url;
  return `${BACKEND_URL}${url}`;
}

export async function uploadWallpaper(
  roomId: string,
  file: File,
): Promise<{ id: string; url: string; kind: WallpaperKind; size: number }> {
  const body = new FormData();
  body.append("roomId", roomId);
  body.append("file", file);

  const res = await fetch(`${BACKEND_URL}/uploads`, { method: "POST", body });
  if (!res.ok) throw new Error(httpUploadError(res.status));
  const parsed = (await res.json()) as { id: string; url: string; kind: WallpaperKind; size: number };
  // Return raw (relative) URL — callers wrap with resolveAssetUrl() only for rendering.
  // The canonical URL stored in state must match what the server broadcasts in wallpaper:uploads.
  return { ...parsed, url: parsed.url };
}
