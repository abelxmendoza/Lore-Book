# Founder Data Isolation

Your concern is valid: **personal lore used to build the app must not leak to other developers through the codebase.**

## What is protected today

### Runtime (users never see your data)

| Surface | Protection |
|---------|------------|
| **Demo mode** (`/demo`, mock data) | Fully synthetic — fictional characters only |
| **Demo privacy CI** | Blocks 40+ real names/emails in mock fixtures |
| **Founder account** | `isFounderAccount` + `founderGuard` — excluded from seed/populate scripts |
| **Production DB** | RLS — each user sees only their own data |

### Repository (what developers can see in git)

| Check | Command | Blocks |
|-------|---------|--------|
| **Founder privacy** | `npm run check:founder-privacy` | Founder emails, UUID, personal lore in `scripts/` |
| **Demo privacy** | `npm run check:demo-privacy` | Real names in mock/demo UI surfaces |

### Scripts (fixed)

- **No hardcoded** `abelxmendoza@gmail.com` or founder UUID as defaults
- Maintenance scripts require `--user`, `--user-id`, or `TARGET_USER_EMAIL` / `TARGET_USER_ID`
- `populate-dummy-data.ts` refuses the founder account
- `seedAshleyKnowledge.ts` loads facts from **`.private/`** (gitignored) only

### Config

- Removed committed `VITE_ADMIN_EMAIL` from `vercel.json` (use Vercel dashboard only)
- Role emails live in Railway/Vercel env vars, not source code

## What still needs awareness

### 1. Tests (`*.test.ts`)

Some server tests still use realistic kinship names (Abuela, Sol, Club Metro) as **test fixtures**. These are not shipped to users but **are visible to developers** reading tests. A follow-up pass can replace them with fictional names (Alex Morgan, Grandma Rose, Blue Room).

### 2. LLM prompt examples (`characters.ts`, etc.)

A few production prompts use real venue/person names as **negative examples** (“don't treat X as a character”). These don't expose your conversations but do embed recognizable names. Genericization is tracked.

### 3. Maintainer-only scripts

`scripts/create-detected-groups.ts` and `apps/server/scripts/lifeReconstructionAudit.ts` still contain founder-specific group/entity names — they're for **your** one-off DB maintenance, not runtime. Prefer loading config from `.private/` when running them.

### 4. Session token files — CRITICAL

If `.lk_session.json` exists locally, it contains a **live JWT with your email and user ID**. It is now in `.gitignore`. **Never commit it.** If it was ever pushed, rotate your session and remove from git history.

### 5. Docs folder

`docs/` may reference your account in architecture/audit writeups. Docs are not in demo or runtime paths but developers with repo access can read them.

## For other developers on the team

Developers using `firefistabel@gmail.com` (or any test account):

- See **only their own** Supabase data (RLS)
- Get **Developer** role → premium without billing
- **Cannot** access your production lore via the app
- **Should not** run maintainer scripts against your account (blocked by `founderGuard`)

## Recommended workflow for you

1. Keep real lore in **Supabase only** (production DB), not in git
2. Put any seed JSON in **`.private/seeds/`** (gitignored)
3. Before commit: `npm run check:founder-privacy && npm run check:demo-privacy`
4. Redeploy Vercel after setting `VITE_OWNER_EMAIL` / `VITE_DEVELOPER_EMAIL` (you did this)

## CI integration

```bash
npm run check:founder-privacy   # tier 1: emails/UUIDs everywhere; tier 2: lore in scripts/
npm run check:demo-privacy      # mock/demo surfaces only
```

Both run in `apps/web` pre-deploy: `npm run test:pre-deploy`
