export function userMessage(code: string, message: string): string {
  switch (code) {
    case "ROOM_NOT_FOUND": return "Room not found. Check the code and try again.";
    case "ROOM_FULL": return message || "Room is full.";
    case "NOT_IN_ROOM": return "You're not in this room.";
    case "NOT_HOST": return "Only the host can do that.";
    case "ALREADY_IN_ROOM": return "You're already in a room.";
    case "TARGET_NOT_IN_ROOM": return "That member isn't here anymore.";
    case "INVALID_PAYLOAD": return message || "That didn't look right.";
    default: return message || "Something went wrong.";
  }
}

export function httpUploadError(status: number): string {
  switch (status) {
    case 400: return "Upload failed — no file given.";
    case 404: return "Room not found while uploading.";
    case 413: return "File too large (20 MB max).";
    case 415: return "Unsupported format. Use jpg, png, gif, webp, mp4, webm.";
    default: return "Upload failed.";
  }
}
