/** YouTube video id extraction shared by TrackPicker + embed player. */

const YT_PATTERNS = [
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})/,
  /(?:https?:\/\/)?youtu\.be\/([a-zA-Z0-9_-]{11})/,
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
  /(?:https?:\/\/)?music\.youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})/,
];

export function extractYouTubeId(url: string): string | null {
  for (const pattern of YT_PATTERNS) {
    const m = url.match(pattern);
    if (m && m[1]) return m[1];
  }
  return null;
}

export function makeEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}?enablejsapi=1&playsinline=1`;
}