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

## Tests

```bash
cd packages/api-contracts && npm test
```
