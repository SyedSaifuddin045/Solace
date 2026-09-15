import { BACKEND_URL } from "@/lib/socket";
import type { Track } from "@/lib/store";

export class ResolveError extends Error {
  embeddable: boolean;
  metadata: Partial<Track>;
  constructor(message: string, embeddable: boolean, metadata: Partial<Track>) {
    super(message);
    this.name = "ResolveError";
    this.embeddable = embeddable;
    this.metadata = metadata;
  }
}

/** Resolve track metadata from a URL via backend */
export async function resolveTrack(url: string): Promise<Track> {
  const res = await fetch(`${BACKEND_URL}/track/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ResolveError(
      body.message || `Resolve failed (${res.status})`,
      body.embeddable === true,
      body.metadata || {}
    );
  }

  return res.json();
}