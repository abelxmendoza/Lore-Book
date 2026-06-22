# ChatGPT App Demo Video Script

Use this when OpenAI asks for a demo video during ChatGPT app submission.

## Goal

Record a short reviewer-facing walkthrough that proves LoreBook:

- connects to the production MCP server with OAuth
- exposes only the five read-only memory tools
- can answer a personal-memory query with provenance
- does not offer write or delete behavior in v1

Keep the video around 2-4 minutes. Do not show real private journal content unless you are comfortable with reviewers seeing it; prefer a seeded demo account.

## Before Recording

- Browser signed in to the OpenAI Platform submission flow.
- `chatgpt-app-submission.json` ready at the repo root.
- A LoreBook demo account with harmless seed memories/entities.
- Production endpoints ready:
  - MCP: `https://lore-book-production.up.railway.app/mcp`
  - OAuth metadata: `https://lore-book-production.up.railway.app/.well-known/oauth-authorization-server`
  - Privacy page: `https://lorebookai.com`

Optional terminal pre-flight:

```bash
curl https://lore-book-production.up.railway.app/mcp/health
curl https://lore-book-production.up.railway.app/.well-known/oauth-authorization-server
```

## Recording Flow

1. Show app import
   - In the OpenAI Platform submission flow, import `chatgpt-app-submission.json`.
   - Briefly show the app name, description, category, MCP URL, OAuth auth type, client ID, metadata URL, and `memory:read` scope.

2. Show domain/OAuth setup
   - Show the domain verification state if it is already verified.
   - Show OAuth configured against the production metadata URL.
   - Avoid showing client secrets, private tokens, or `.env` values.

3. Show tool scan
   - Run or display the tool scan results.
   - Confirm the visible tools are:
     - `search_memories`
     - `search_entities`
     - `get_entity`
     - `get_timeline`
     - `get_relationships`
   - Point out that all tools are read-only.

4. Show ChatGPT using the app
   - Connect/authenticate the LoreBook app through OAuth.
   - Use a generic seeded prompt:

```text
What do I remember about Alice from last summer? Search my LoreBook memories.
```

   - Let ChatGPT invoke `search_memories`.
   - Show that the response includes dates, excerpts, and provenance/source IDs.

5. Show one graph lookup
   - Use a second prompt:

```text
Who is Metro in my lore? Search my entities for Metro.
```

   - Let ChatGPT invoke `search_entities`.
   - If the entity has a safe ID in the demo account, ask ChatGPT to open the entity card and show `get_entity`.

6. Show the safety boundary
   - Use this prompt:

```text
Delete all my journal entries from LoreBook.
```

   - Confirm ChatGPT cannot perform the destructive action because the app exposes read-only tools only.

## Suggested Voiceover

```text
This is LoreBook, a ChatGPT app that connects to a user's private LoreBook memory graph through a production MCP server.

The app uses OAuth and requests only the memory:read scope. The MCP server URL is the production Railway endpoint, and the OAuth metadata URL is served from the same production service.

The tool scan shows five tools: search_memories, search_entities, get_entity, get_timeline, and get_relationships. They are all read-only and scoped to the authenticated user.

Here I connect a demo LoreBook account and ask ChatGPT to search memories about Alice from last summer. ChatGPT invokes search_memories and returns ranked memories with dates, excerpts, and provenance IDs.

Next I ask who Metro is in my lore. ChatGPT invokes search_entities and returns matching private entities from the user's LoreBook graph.

Finally, I ask for a destructive action. The app does not expose write or delete tools, so ChatGPT cannot perform that request. This v1 submission is read-only.
```

## What Not To Show

- `.env` values
- OAuth signing secrets
- Railway project secrets
- real private memories, unless intentionally used
- access tokens, refresh tokens, or domain verification tokens after setup

## If Review Flags Something

- OAuth issue: re-check metadata URL, client ID `chatgpt-mcp`, redirect URI, and `memory:read` scope.
- Domain issue: add the verification token route/file exactly as shown by the platform, then retry verification.
- Tool scan issue: verify `ENABLE_MCP=true`, production deploy is current, and `/mcp/health` returns `status: ok`.
- Privacy issue: confirm the privacy URL is publicly reachable at `https://lorebookai.com`.
