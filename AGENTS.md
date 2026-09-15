# Solace — Agent Guide

Watch-together app. Monorepo: `backend/` (socket.io + Express, in-memory rooms) + `frontend/` (Next.js App Router client). No DB, no auth — the 6-char roomId IS the capability.

## Repo map
- `backend/` — server. See `backend/AGENTS.md` (commands, architecture, test conventions). Node >=20, CommonJS, no build step.
- `frontend/` — Next.js client. See `frontend/AGENTS.md` (Next.js version caveats, backend contract) and `frontend/CLAUDE.md`.
- `docs/frontend-design/` — UX spec + implementation plan deltas. Local-only, not in git.

## Code discovery: use the knowledge graph FIRST
This repo is indexed in codebase-memory-mcp as project **`Users-saif-Programming-Solace`**. Prefer graph tools over grep/glob:

1. `search_graph(query="natural language", project="Users-saif-Programming-Solace")` — find functions, classes, routes by intent or name. Socket handlers at `backend.src.socket.handlers.<X>.create<X>Handler`; frontend components at `frontend.components.<Area>.<Component>`.
2. `trace_path(function_name, direction, project=...)` — "who calls X" / "what does X call". Socket event wiring starts in `createSocketServer` (backend/src/socket/index.js).
3. `get_code_snippet(qualified_name, project=...)` — full source once you know the qualified name.
4. `query_graph(cypher, project=...)` — complex multi-hop patterns, hotspots, dead code.
5. `get_architecture(project=...)` — clusters, routes, entry points, boundaries.

## Working patterns
- **Socket wire-names**: `backend/src/socket/events.js` is the single source of truth. Never inline literal event strings.
- **Backend room state**: `backend/src/rooms/RoomService.js` — `appendActivity` and `addUpload` are choke points.
- **Cross-layer**: frontend `lib/socket.ts` (via `getSocket`) <-> backend socket.io; `frontend/lib/upload.ts` <-> `backend/src/upload/`; `frontend/lib/track.ts` <-> `backend/src/track/trackRouter.js`.
- Fall back to grep/glob only for string literals, error messages, config values, and non-code files.

## Keeping the index fresh
- Auto-refresh: git hooks in `scripts/git-hooks/` (post-commit + post-merge) re-index the graph after every commit/merge via `codebase-memory-mcp cli index_repository`. Wire once per clone: `git config core.hooksPath scripts/git-hooks`.
- Manual: after big refactors, re-run `index_repository` (mode `full`, persistence true) or `detect_changes`.
- `.codebase-memory/graph.db.zst` is the shared graph artifact — commit it so teammates bootstrap from the same index (the post-commit hook refreshes it automatically).
