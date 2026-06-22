# OpenAI Agent Skills (LoreBook)

Versioned skill bundles for the [OpenAI Responses API shell tool](https://developers.openai.com/api/docs/guides/tools-shell). These are **developer/admin workflows only** — never expose arbitrary skill selection to end users.

## Bundles

| Folder | Skill name | Purpose |
|--------|------------|---------|
| `character-card-audit/` | `lorebook-character-card-audit` | Card audit taxonomy, auto-fix vs review queue |
| `lorebook-rescan-ops/` | `lorebook-rescan-ops` | Rescan, incremental rules, 3-strike protocol |

## Commands

```bash
# Create zips under openai-skills/dist/
npm run openai-skills:package

# Upload to OpenAI (requires OPENAI_API_KEY)
npm run openai-skills:upload

# Package + upload + write manifest
npm run openai-skills:sync
```

After sync, copy skill IDs from `openai-skills/manifest.json` into Railway/Vercel env:

- `OPENAI_SKILL_CHARACTER_CARD_AUDIT_ID`
- `OPENAI_SKILL_RESCAN_OPS_ID`
- `OPENAI_SKILLS_AGENT_ENABLED=true`
- `OPENAI_AGENT_MODEL=gpt-5.4` (or newer with shell support)

## Admin API

`POST /api/admin/agent/skills/run` (admin role required)

```json
{
  "workflow": "character_card_audit",
  "targetUserId": "<uuid>",
  "input": "Summarize bad cards and what I should review manually."
}
```

The server loads live audit/rescan data, then invokes OpenAI hosted shell with mounted skills.
