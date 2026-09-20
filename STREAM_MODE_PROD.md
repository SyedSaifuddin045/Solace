# Stream Mode on Production — the ip-pin problem & Option B

Status: **tracking doc**. Decided 2026-09-20: revert server-proxy redirect-follow fix
(`7661ffb`, reverted in `af97bcc`) and ship **Option B (client-side resolve)** once
the app has stable ground.

## Why stream mode can never work on prod via the server proxy

Fact chain, proven empirically on api.solaceroom.xyz (Coolify):

1. `GET /track/resolve` runs **server-side**, so the returned `audioUrl`
   (googlevideo `videoplayback`) is signed with `ip=<server egress>`
   (observed `31.59.20.176` on prod; `43.224.130.126` when served from a
   dev mac).
2. YouTube enforces that `ip` param. A browser on a different public ip gets
   `MEDIA_ELEMENT_ERROR: Format error` (code 4) in ~900ms on a direct
   `<audio src>` — repro'd in the real prod site.
3. Server-to-server hop has its own problems:
   - Pre-`7661ffb`: googlevideo answers `302` (cms_redirect/redirect_counter);
     `https.get` did not follow → proxied `text/html` empty body →
     browser ORB-block → every song fell back to embed.
   - `7661ffb` (follow redirects, 5-hop cap, UA, Range): correct locally
     (resolve from dev ip → `rr1-cagl` serves `206 audio/mp4` direct) but on
     prod the 2nd hop from the datacenter **hangs** (>80s no data, no error)
     — blocked egress, can't fix in application code.

Nothing server-side can produce a URL the end-user's browser can actually
stream. Embed works on prod only because Google's iframe player uses its own
session/cookies (ip-pin transparent inside Google's auth flow).

## Option B — client-side resolve (the real fix)

Frontend obtains the streaming URL itself, from the browser, so the
`ip` pin matches the user's public ip. Same endpoint youtube.com's own web
player uses.

Mechanism:

- Browser `POST https://www.youtube.com/youtubei/v1/player` with a `WEB`
  innertube client context (`clientVersion`, `apiKey` from current youtube.com
  webpack; key is public — the site ships it).
- Parse `streamingData.adaptiveFormats`: prefer `itag=140` (m4a audio);
  fall back to opus (`itag=249/250/251`); keep `mime`, `bitrate`,
  `content_length`, `approx_duration_ms`.
- Set `<audio src>` to the returned `url` directly (media element follows any
  302 natively — browser-ip-pinned target accepts). No `/track/proxy` in the
  play path.
- Keep `/track/proxy` + `/track/resolve` for anything that still needs a
  server-side answer; do not route normal playback through them.

Security notes:

- innertube `apiKey`/`clientVersion` are public constants (youtube.com
  ships them; extraction is routine and legitimate — this is what
  youtube-dl-style clients do).
- Playback gating already happens at the socket layer (`playback:play` only
  from members); the resolved URL was already visible to every member via
  `playback:state.track` — client-side resolve adds no new leak surface.
- Signatures: modern `WEB` responses come pre-signed in the URL (`sig`,
  `lsig`) — no deciphering step needed for player responses today. If YouTube
  ever re-enables `s`-formats, add the JS decipher routine (known pattern).

Risks / mitigations:

- **Innertube schema drift** (client allows list, ordering, param renames) →
  fetch the WHOLE generic player response, extract defensively; fail → embed.
- **apiKey / clientVersion rotation** → bundle several known-good
  clientVersion+apiKey pairs (mirror current stable yt web deploys); pick
  round-robin, retry next on 4xx.
- **Per-ip rate limiting / bot checks** (innertube may soft-cap
  automated-looking browsers) → keep request shaped like real web client
  (headers, `context.client` real web values); if blocked → embed fallback
  (never degrade the UX below embedded playback).
- **CORS** — youtubei is CORS-open for browsers today; verify per deploy.
- **Testing** — real-YouTube browser e2e required (Playwright), same QA path
  as the playback-mode switch work (room, second member, currentTime
  advance, skip, yield, embed → stream flip).
- **Consistency** — members in embedded mode receiving a client-resolved
  track: keep the dual broadcast path (`playback:state` immediate + refreshed)
  so mixed stream/embed members stay in sync; `audioUrl` present in
  `playback:state` regardless of who resolved it.

Acceptance for B:

- Stream plays on prod for a real user (browser-ip pin), skip/seek via
  Range intact, dual-member sync intact, embed-yield fixed as today,
  no ORB/text-html/hang anywhere on the play path.

## Reverted experiment (kept for reference)

- `7661ffb` — backend redirect-follow proxy (worked only for dev-ip egress).
- Reverted by `af97bcc`; prod back to embed-always via the existing
  self-healing fallback. Re-do this ONLY as a fallback for dev/local
  environments, never as the prod play path.