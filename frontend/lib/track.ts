import { BACKEND_URL } from "@/lib/socket";
import type { Track } from "@/lib/store";

/** Resolve track metadata from a URL via backend */
export async function resolveTrack(url: string): Promise<Track> {
  const res = await fetch(`${BACKEND_URL}/track/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Resolve failed (${res.status})`);
  }

  return res.json();
}
