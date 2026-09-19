import { useEffect, useRef } from "react";
import { useRoomStore } from "@/lib/store";
import { getSocket } from "@/lib/socket";

/**
 * Chat arrival notification: bumps the unread-dot counter and plays a short
 * synth beep when an incoming chat message arrives while the chat panel is
 * closed. Own messages are ignored (server broadcasts room:activity to
 * everyone, including the sender). Clearing happens the moment the panel
 * opens.
 *
 * The beep is a tiny WebAudio blip (no asset). If the AudioContext is still
 * suspended (autoplay policy) the beep tries a resume once; if that fails the
 * beep is skipped silently — never spam errors, never force audio on anyone.
 */

let beepCtx: AudioContext | null = null;

function beep(): void {
  try {
    beepCtx = beepCtx ?? new AudioContext();
    if (beepCtx.state === "suspended") {
      void beepCtx.resume().then(() => {
        if (beepCtx) playBeep(beepCtx);
      });
      return;
    }
    playBeep(beepCtx);
  } catch {
    // autoplay policy / missing WebAudio — notification is visual-only
  }
}

function playBeep(ctx: AudioContext): void {
  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.1, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
  gain.connect(ctx.destination);
  const blip = (freq: number, at: number) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, at);
    osc.connect(gain);
    osc.start(at);
    osc.stop(at + 0.09);
  };
  blip(880, now);        // first blip
  blip(660, now + 0.15); // second blip, 150ms later
}

export function useChatNotifications(chatPanelOpen: boolean): void {
  const panelOpenRef = useRef(chatPanelOpen);
  panelOpenRef.current = chatPanelOpen;

  useEffect(() => {
    const socket = getSocket();
    const onActivity = (payload: { entry?: { type?: string; actor?: { socketId?: string } } }) => {
      const entry = payload?.entry;
      if (!entry || entry.type !== "chat") return;
      const me = useRoomStore.getState().socketId;
      if (!me || entry.actor?.socketId === me) return;
      if (panelOpenRef.current) return;
      useRoomStore.getState().bumpChatUnread();
      beep();
    };
    socket.on("room:activity", onActivity);
    return () => {
      socket.off("room:activity", onActivity);
    };
  }, []);

  // Opening the chat panel marks everything read.
  useEffect(() => {
    if (chatPanelOpen) useRoomStore.getState().clearChatUnread();
  }, [chatPanelOpen]);
}