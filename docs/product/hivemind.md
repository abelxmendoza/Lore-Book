# Hivemind in LoreBook

Hivemind is LoreBook's cross-agent workspace. Every AI agent you work with
(Claude Code, Codex, Cursor, Antigravity, ChatGPT) connects to the same
LoreBook MCP server and shares one board:

- **Checkpoints**: one live "where I left off" per project, with next steps.
- **Shared agent memories**: decisions, conventions and setup gotchas every
  agent should know. Saving the same title again updates it.
- **Milestones**: a ledger of shipped work.

It is a LoreBook feature, not a separate product: same account, same login,
same MCP server, same database. The page lives at `/hivemind`.

## Who can use it

Signup stays open to everyone. Hivemind is gated per account by
`apps/server/src/lib/hivemindAccess.ts`:

| `HIVEMIND_ACCESS` | Who gets Hivemind |
| --- | --- |
| `founder` (default) | owner + admin (the founder account set by `OWNER_EMAIL` / `OWNER_USER_ID`) |
| `privileged` | owner + admin + developer |
| `all` | every signed-in account |

A single account can be granted access at any level by setting the
server-only flag `app_metadata.hivemind_access = true` (Supabase dashboard or
admin API). `user_metadata` is client-writable and is never consulted.

The flag is exposed to the web app as `canUseHivemind` on
`GET /api/user/authority`. The `/hivemind` route and the sidebar link use it;
the API enforces it independently.

## API

All routes require auth + Hivemind access (`403` otherwise).

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/hivemind` | Overview: checkpoints, recent memories, recent milestones |
| GET / PUT | `/api/hivemind/checkpoints` | List / upsert (one per project) |
| DELETE | `/api/hivemind/checkpoints/:id` | Remove |
| GET / POST | `/api/hivemind/memories?q=&project=` | Search / upsert by title |
| DELETE | `/api/hivemind/memories/:id` | Remove |
| GET / POST | `/api/hivemind/milestones` | List / add |

### Importing from agent-hivemind

The `/hivemind` page has an **Import** button that takes the local tool's
`state/hivemind_state.json`. Only `active_tasks` (checkpoints) and
`career_ledger.milestones` are read; machine paths and network details are
ignored. Re-importing is safe: checkpoints update in place and milestones that
already exist are skipped. API: `POST /api/hivemind/import`.

## MCP tools

Registered only when **both** the account has Hivemind and the token carries
the scope:

| Tool | Scope |
| --- | --- |
| `hivemind_where_i_left_off`, `hivemind_recall`, `hivemind_milestones` | `hivemind:read` |
| `hivemind_checkpoint`, `hivemind_record_memory`, `hivemind_log_milestone` | `hivemind:write` |

Writes that look like secrets (API keys, tokens, private keys) are refused,
and the audit log stores only metadata, never memory text.

Agents follow the check-in / check-out ritual in
`skills/lorebook-session-handoff/SKILL.md`.

### Connecting an agent

Add the LoreBook MCP server (`https://<api-host>/mcp`) to the agent and sign
in through the OAuth consent page, requesting
`memory:read hivemind:read hivemind:write`. OAuth clients registered before
this change only allow the lore scopes; reconnect (re-register) them to pick
up the Hivemind scopes.

## Relationship to the local `agent-hivemind` tool

The local Python tool keeps doing what only a local process can: reading
agent session files on disk, syncing skill folders and MCP configs, and
installing hooks. The parts that were synced by committing `LIVE_STATE.md` to
git (checkpoints, memories, career milestones) now have a cloud home here, so
agents on any device read the same state through MCP.
