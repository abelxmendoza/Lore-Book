---
name: lorebook
description: Read and write a user's LoreBook lore through the LoreBook MCP server. Use when a conversation contains autobiographical information worth keeping — career moves, people, places, projects, decisions, life events — or when answering would be better grounded in what the user has lived before. Teaches any AI the LoreBook ritual: read before you write, write only through ingest_story, and never correct lore on the user's behalf.
---

# LoreBook — one lore, every AI

LoreBook (lorebookai.com) is a life-memory system: one personal lore graph —
people, places, projects, decisions, and chapters — that every AI the user
talks to can read from and write to, so the user stops re-explaining their
own life to each new chatbot.

This skill is the behaviour layer. The connection layer is MCP; this file is
what makes ten different AIs write lore the *same* way.

## Connection

- **MCP server:** `lorebook-memory`
- **Endpoint:** `https://lore-book-production.up.railway.app/mcp`
- **Auth:** OAuth 2.1 + PKCE, per-AI client. Each AI connects separately,
  under its own client, with its own permission. Never share a credential
  between AIs, and never ask the user for a password or a raw token.
- **Scopes:** `memory:read` to read, `memory:write` to write. A read-only
  token sees only the read tools — that is by design, not an error.
- The account a connection writes to is the account that approved the
  consent screen. If the lore you read back is not the user's, you are
  connected to the wrong account: stop and reconnect.

Connect recipes (give the user the one for the AI you are running in):

| AI | How to connect |
|---|---|
| Muse | Add LoreBook as a custom MCP connector and approve the OAuth consent. |
| Claude | Customize → Connectors → Add custom connector → paste the MCP endpoint → Connect. In Claude Code: `claude mcp add --transport http lorebook https://lore-book-production.up.railway.app/mcp`, then `/mcp` to sign in. |
| ChatGPT | Settings → Developer Mode on → create an MCP app with the endpoint → sign in with OAuth. |
| Grok | Connectors → New Connector → Custom (Bring Your Own MCP) → paste the endpoint → sign in. |
| Codex / other MCP clients | Add a remote HTTP MCP server with the endpoint and complete the OAuth flow. |

If LoreBook is not connected in this AI yet, say so plainly and give the
user the recipe above. **Never claim you recorded something you did not.**

## Tools

Read (require `memory:read`):

- `search_memories` — search the user's recorded lore.
- `search_entities` — find people, places, and projects already in the graph.
- `get_entity` — everything known about one person, place, or project.
- `get_timeline` — the user's lore in time order.
- `get_relationships` — how entities connect to each other.

Write (require `memory:write`):

- `ingest_story` — **the only write path an AI uses.** Stores a piece of
  autobiographical narrative. LoreBook extracts entities, dedupes against
  existing lore, and stamps the entry with which AI wrote it. Input is
  capped at 20,000 characters.
- `correct_lore` — **never call this.** Corrections are permanent user
  authority in LoreBook. See "Corrections" below.

## The ritual

### 1. Verify before anything (first connection only)

Immediately after connecting, read first: run `search_memories` and confirm
it returns the user's real, recognisable lore. If it returns an empty or
unfamiliar graph, stop — do not write anything — and tell the user the
connection looks bound to the wrong account.

### 2. Read before you write (every time)

Before recording anything, search for it (`search_memories` /
`search_entities`). The lore may already hold it — possibly written by a
different AI. Reading first is how one lore stays one lore: no duplicates,
no contradictions, and your answer can build on what is already known.

### 3. Decide what counts as lore

Record **autobiographical** material the user shares about their own life:

- Career moves, job changes, interviews, offers, projects started or shipped
- People — who they are, how the user knows them, what changed
- Places lived, moved to, or tied to events
- Decisions and the reasoning the user gave for them
- Life events, milestones, turning points, recurring patterns

Do **not** record:

- Code, tool output, debugging chatter, or meta-discussion about the AI itself
- Other people's private information that is not part of the user's own story
- Anything the user tells you *not* to record — that instruction always wins
- Guesses. If the user did not say it, it is not lore.

When in doubt, ask the user in one line — "Want me to save that to
LoreBook?" — rather than silently recording or silently skipping.

### 4. Write through `ingest_story` only

- Pass the story as the user told it, in plain narrative. Do not embellish,
  summarise away the details that make it theirs, or invent names, dates,
  or outcomes to fill gaps.
- One story per call. A long update with three separate events is three calls.
- The server's narrative guard will reject non-lore input; if it does,
  don't fight it — the material probably wasn't lore.

### 5. Confirm

After a write, read it back (`search_memories`) and tell the user in one
short line what landed — e.g. "Saved to LoreBook: the new job starting
Monday, and that you're reporting to Jeremiah." No ceremony, no report.
If the read-back doesn't show it, say the write didn't land; never paper
over a failed write with a success message.

## Corrections

If the user says existing lore is wrong — a name, a date, a relationship —
**do not call `correct_lore` yourself.** Corrections are the user's
permanent authority and outrank anything any AI ingests.

Instead: state the correction back to the user in chat, exactly as they gave
it, and let them apply it in LoreBook — or write it only when the user
explicitly instructs you to, in that moment, with those exact words.

## Privacy

- The user's lore is private. Never paste it into web searches, other tools,
  or other people's conversations, and never quote it to anyone but the user.
- Everything you read stays in service of the current conversation with
  this user. Nothing about the lore changes how you talk to anyone else.
- Each AI's access is separate. Disconnecting one AI never affects the
  others, and the user can disconnect you at any time — if they do, accept
  it without argument.

## A good exchange

> **User:** "Finally signed the offer — I start at Northwind on Monday,
> reporting to Sam."
>
> **AI:** *(searches first — finds the interview already in lore, no offer
> recorded yet — then calls `ingest_story` with the signing and the start
> date, reads it back)* "Saved to LoreBook: Northwind offer signed,
> starting Monday, reporting to Sam. That closes the loop on the interview
> you recorded last week."
