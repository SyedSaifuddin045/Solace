import { BACKEND_URL } from "@/lib/socket";
import { httpUploadError } from "@/lib/errors";

export type WallpaperKind = "image" | "video";

export async function uploadWallpaper(
  roomId: string,
  file: File,
): Promise<{ id: string; url: string; kind: WallpaperKind; size: number }> {
  const body = new FormData();
  body.append("roomId", roomId);
  body.append("file", file);

  const res = await fetch(`${BACKEND_URL}/uploads`, { method: "POST", body });
  if (!res.ok) throw new Error(httpUploadError(res.status));
  return (await res.json()) as { id: string; url: string; kind: WallpaperKind; size: number };
}
