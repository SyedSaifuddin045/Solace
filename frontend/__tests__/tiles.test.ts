import { describe, it, expect } from "vitest";
import { pinnedIds, memberHasMedia } from "@/lib/tiles";
import type { Member } from "@/lib/store";

const member = (id: string, over: Partial<Member> = {}): Member => ({
  socketId: id,
  displayName: id,
  isHost: false,
  audioOn: false,
  videoOn: false,
  ...over,
});

type FakeTrack = { kind: "audio" | "video"; readyState: string; muted: boolean };
const mkStream = (audio: FakeTrack | null, video: FakeTrack | null): MediaStream =>
  ({
    getTracks: () => [audio, video].filter(Boolean) as MediaStreamTrack[],
  }) as unknown as MediaStream;

const live = (kind: "audio" | "video", muted = false): FakeTrack => ({ kind, readyState: "live", muted });
const ended = (kind: "audio" | "video"): FakeTrack => ({ kind, readyState: "ended", muted: false });

describe("pinnedIds — video never disappears", () => {
  it("pins member whose server video flag is on, even with no stream yet", () => {
    const members = [member("s1", { videoOn: true })];
    expect(pinnedIds(members, {}, []).has("s1")).toBe(true);
  });

  it("pins member with a live unmuted remote video track", () => {
    const members = [member("s1")];
    const streams = { s1: mkStream(null, live("video")) };
    expect(pinnedIds(members, streams, []).has("s1")).toBe(true);
  });

  it("pins member with live unmuted audio AND video when videoOn flag was missed", () => {
    const members = [member("s1", { videoOn: false })];
    const streams = { s1: mkStream(live("audio"), live("video")) };
    expect(pinnedIds(members, streams, []).has("s1")).toBe(true);
  });

  it("does NOT pin a member with a muted/ended video track", () => {
    const members = [member("s1", { videoOn: false })];
    expect(pinnedIds(members, { s1: mkStream(null, live("video", true)) }, []).has("s1")).toBe(false);
    expect(pinnedIds(members, { s1: mkStream(null, ended("video")) }, []).has("s1")).toBe(false);
  });
});

describe("pinnedIds — audio pins only on actual received audio", () => {
  it("pins when a live unmuted remote audio track exists (mic turned on)", () => {
    const members = [member("s1", { audioOn: true })];
    const streams = { s1: mkStream(live("audio"), null) };
    expect(pinnedIds(members, streams, []).has("s1")).toBe(true);
  });

  it("does NOT pin on the self-reported audioOn flag alone", () => {
    const members = [member("s1", { audioOn: true })];
    expect(pinnedIds(members, {}, []).has("s1")).toBe(false);
  });

  it("does NOT pin when the remote audio track is muted (not actually audible)", () => {
    const members = [member("s1", { audioOn: true })];
    const streams = { s1: mkStream(live("audio", true), null) };
    expect(pinnedIds(members, streams, []).has("s1")).toBe(false);
  });

  it("pins a speaking member even without any media", () => {
    const members = [member("s1")];
    expect(pinnedIds(members, {}, ["s1"]).has("s1")).toBe(true);
  });

  it("does not pin an idle silent member without media", () => {
    const members = [member("s1")];
    expect(pinnedIds(members, {}, []).has("s1")).toBe(false);
  });
});

describe("memberHasMedia", () => {
  it("true when server flags say media on (feed tile can render connecting state)", () => {
    expect(memberHasMedia(member("s1", { audioOn: true }), {})).toBe(true);
    expect(memberHasMedia(member("s1", { videoOn: true }), {})).toBe(true);
  });
  it("true when a live remote audio or video track received", () => {
    expect(memberHasMedia(member("s1"), { s1: mkStream(live("audio"), null) })).toBe(true);
    expect(memberHasMedia(member("s1"), { s1: mkStream(null, live("video")) })).toBe(true);
  });
  it("false for a quiet member with no streams and no flags", () => {
    expect(memberHasMedia(member("s1"), {})).toBe(false);
  });
});