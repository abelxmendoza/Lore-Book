# `@lorebook/api-contracts`

Shared Zod schemas for Lore Book JSON communication (REST envelopes, chat SSE, durability).

## Usage

```ts
import {
  parseChatStreamEvent,
  formatSseDataLine,
  unwrapApiData,
  type ChatStreamEvent,
} from '@lorebook/api-contracts';
```

- **Server:** `file:../../packages/api-contracts` dependency + Node resolution.
- **Web (local):** Vite alias → this package.
- **Web (Vercel):** Vite alias falls back to `apps/web/src/lib/api-contracts` (vendored mirror).

When you change contracts here, **copy** `src/**` into `apps/web/src/lib/api-contracts/` so production builds stay in sync.

```bash
# from repo root
PKG=packages/api-contracts/src
MIR=apps/web/src/lib/api-contracts
mkdir -p "$MIR/chat" "$MIR/ingestion"
cp "$PKG/envelopes.ts" "$MIR/"
cp "$PKG/chat/"*.ts "$MIR/chat/" 2>/dev/null || true
cp "$PKG/ingestion/common.ts" "$PKG/ingestion/semanticGuards.ts" \
   "$PKG/ingestion/jobPayloads.ts" "$PKG/ingestion/envelope.ts" \
   "$PKG/ingestion/index.ts" "$MIR/ingestion/"
printf '%s\n' '/* Vendored mirror of packages/api-contracts — DO NOT EDIT. */' > "$MIR/index.ts"
cat "$PKG/index.ts" >> "$MIR/index.ts"
```

Parity is enforced by `apps/web/src/lib/api-contracts/mirrorParity.test.ts`.

## Tests

```bash
cd packages/api-contracts && npm test
```
