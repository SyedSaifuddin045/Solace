// Session-scoped room password cache. Dies with the tab — enough for reloads,
// never persisted. The room password itself is the capability, same as roomId.
const key = (roomId: string) => `solace:room-pw:${roomId}`;

export function readRoomPassword(roomId: string): string | null {
  return sessionStorage.getItem(key(roomId));
}

export function writeRoomPassword(roomId: string, password: string): void {
  if (!password) return;
  sessionStorage.setItem(key(roomId), password);
}