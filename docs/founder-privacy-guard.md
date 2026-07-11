# Founder privacy guard

Pre-commit and CI run `npm run check:founder-privacy`. **Never bypass with `--no-verify`** unless you are scrubbing a known false positive.

## Blocked in tracked code

**Tier 1** (all of `apps/` and `scripts/`):
- Founder emails and user UUID (see `scripts/check-founder-privacy.cjs`)

**Tier 2** (tests, mocks, scripts — string literals only):
- Personal lore: `Ashley De La Cruz`, `Club Metro`, `Building LoreBook`, `Bathroom Guardian`, `Armstrong Robotics`, `Armstrong`

**Public simulation guard** (`chatLifecycleSimulation.ts`):
- Blocks founder-linked names, venues, and events that must not appear in guest/demo conversations.
- Keep those terms in the guard script or `.private/`; do not copy them into public fixtures or documentation.

## Use synthetic fixtures instead

| Need | Use |
|------|-----|
| Robotics employer | `Vanguard Robotics` |
| Coworkers | `Gary`, `Jeff` |
| Deployment site (disambiguation tests) | `Denny's in Hollywood` or prefer `Northwind Depot` for new tests |
| Product (not LoreBook) | `MemoVault`, `Northwind Labs` |
| Demo people | Names from `romanticLoreTestCases` |

## Personal corpus

Founder-specific test corpus belongs in `.private/` (gitignored). Load at runtime — do not commit literals.

## Cursor / AI agents

When generating inference tests or fixtures, follow the synthetic names above. If a test must reference the LoreBook product, build the phrase dynamically:

```ts
const buildingPhrase = ['building', 'LoreBook'].join(' ');
infer(`I have been ${buildingPhrase} with Claude Code.`);
```

This avoids tripping the literal scanner while still exercising product guards.
