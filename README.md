# Solace

Watch-together app. Monorepo: `backend/` (socket.io + Express, in-memory rooms) + `frontend/` (Next.js App Router client). No DB, no auth — the 6-char roomId IS the capability.

## Repository structure

- `backend/` — Node ≥20, CommonJS, no build step. See `backend/AGENTS.md` for commands, architecture, test conventions.
- `frontend/` — Next.js client (App Router). See `frontend/AGENTS.md` for version caveats and backend contract; `frontend/CLAUDE.md` for additional context.
- `docs/frontend-design/` — UX spec and implementation plan deltas. Local-only, not in git.
- `scripts/git-hooks/` — Git hooks for automatic knowledge graph refresh.

## Codebase Knowledge Graph (codebase-memory-mcp)

This repository includes an always-fresh **codebase-memory-mcp** knowledge graph so agents can instantly locate functions, classes, routes, dependencies, and call chains without grepping. The graph indexes every source file (excluding `node_modules`, `.next`, `uploads`, etc.) and stays current automatically.

### Project name

All graph queries use the project name: **`Users-saif-Programming-Solace`**

### Teammate setup (one command after clone)

After cloning the repo, wire the git hooks so the graph refreshes automatically on every commit and merge:

```bash
git config core.hooksPath scripts/git-hooks
```

That's it. The hooks are silent and non-blocking (~100ms incremental update).

### How auto-refresh works

- **Post-commit hook** (`scripts/git-hooks/post-commit`): after every commit, runs `codebase-memory-mcp cli index_repository` in full mode with persistence enabled. Updates `.codebase-memory/graph.db.zst` (the shared artifact).
- **Post-merge hook** (`scripts/git-hooks/post-merge`): runs the same refresh after pull/merge so the graph stays current with incoming changes.

Both hooks are no-ops if the `codebase-memory-mcp` binary is missing or if running in CI.

The binary path defaults to `/Users/saif/.local/bin/codebase-memory-mcp`. Override with env `CODEBASE_MEMORY_MCP_BIN` if installed elsewhere.

### Shared graph artifact

`.codebase-memory/graph.db.zst` is committed to the repo so teammates bootstrap from the same indexed graph without re-indexing from scratch. The post-commit hook keeps it fresh automatically.

### Manual refresh

After a major refactor or if the graph seems stale, re-run manually:

```bash
codebase-memory-mcp cli index_repository '{"repo_path":"/path/to/Solace","mode":"full","persistence":true}'
```

Or use `detect_changes` for a lighter diff-based update:

```bash
codebase-memory-mcp cli detect_changes '{"project":"Users-saif-Programming-Solace"}'
```

### Using the graph (for agents)

Agents should prefer graph tools over grep/glob for code discovery. Priority order:

1. **`search_graph`** — find functions, classes, routes by intent or name. Socket handlers live at `backend.src.socket.handlers.<X>.create<X>Handler`; frontend components at `frontend.components.<Area>.<Component>`.
2. **`trace_path`** — "who calls X" / "what does X call". Socket event wiring starts in `createSocketServer` (`backend/src/socket/index.js`).
3. **`get_code_snippet`** — full source + complexity metrics once you know the qualified name.
4. **`query_graph`** — complex Cypher queries for multi-hop patterns, hotspots, dead code.
5. **`get_architecture`** — clusters, routes, entry points, boundaries.

Fall back to grep/glob only for string literals, error messages, config values, and non-code files.

### Working patterns

- **Socket wire-names**: `backend/src/socket/events.js` is the single source of truth. Never inline literal event strings.
- **Backend room state**: `backend/src/rooms/RoomService.js` — `appendActivity` and `addUpload` are choke points.
- **Cross-layer**: frontend `lib/socket.ts` (via `getSocket`) ↔ backend socket.io; `frontend/lib/upload.ts` ↔ `backend/src/upload/`; `frontend/lib/track.ts` ↔ `backend/src/track/trackRouter.js`.

## Development

Refer to `backend/AGENTS.md` and `frontend/AGENTS.md` for per-package commands (test, dev, build).

## License

See `LICENSE` if present.
