# Runtime Health Report
**Generated:** 2026-05-26

---

## Summary

| Check | Result |
|-------|--------|
| TypeScript errors (tsc --noEmit) | 🔴 521 |
| CORE_RUNTIME route errors | ✅ 0 |
| Unsafe `as any` usages | 🟡 1283 |
| @ts-ignore suppressions | ✅ 0 |
| Cross-package imports (server→web) | ✅ 0 |
| Hardcoded localhost leaks | 🟡 9 |
| Bare `supabase` imports (should use supabaseAdmin) | 🟡 8 |
| Duplicate route paths | ✅ 0 |
| Unknown env var references | 🟡 32 |
| console.log in production code | 🟡 29 |
| Routes without auth check | 🟡 17 |
| Orphan services (sample) | 🟡 20 |
| Top-level await outside IIFE | ✅ 0 |

---

## CORE_RUNTIME Route Errors (CRITICAL)

_No errors in CORE_RUNTIME routes. ✅_

---

## Cross-Package Imports (CRITICAL)

_None detected._

---

## Duplicate Route Paths

_No duplicate paths detected._

---

## Hardcoded Localhost Leaks

- `src/billing/billingRouter.ts:38` — `success_url: `${req.headers.origin ?? 'http://localhost:5173'}/billing/success`,`
- `src/billing/billingRouter.ts:39` — `cancel_url: `${req.headers.origin ?? 'http://localhost:5173'}/billing/cancel``
- `src/billing/billingRouter.ts:54` — `return_url: `${req.headers.origin ?? 'http://localhost:5173'}/settings``
- `src/config/swagger.ts:21` — `url: `http://localhost:${config.port}`,`
- `src/index.ts:59` — `connectSrc: ["'self'", "https://*.supabase.co", "https://api.openai.com", "ws:", "wss:", "http://localhost:*"],`
- `src/index.ts:109` — `'http://localhost:5173',`
- `src/index.ts:110` — `'http://127.0.0.1:5173',`
- `src/middleware/secureHeaders.ts:32` — `csp.push("connect-src 'self' ws://localhost:* http://localhost:* https://*.supabase.co https://api.openai.com");`
- `src/swagger.ts:30` — `url: process.env.API_URL || 'http://localhost:4000',`

---

## Bare `supabase` Imports (should use `supabaseAdmin` from dbAdapter)

- `src/middleware/auth.ts:90` — `const { data, error } = await supabase.auth.getUser(token);`
- `src/scripts/migrateExistingUsers.ts:18` — `const { data: users, error: usersError } = await supabase.auth.admin.listUsers();`
- `src/services/photoService.ts:185` — `const { data: uploadData, error: uploadError } = await supabase.storage`
- `src/services/photoService.ts:198` — `const { data: urlData } = supabase.storage.from('photos').getPublicUrl(filePath);`
- `src/services/photoService.ts:328` — `const { data: files, error } = await supabase.storage`
- `src/services/photoService.ts:352` — `const { data: urlData } = supabase.storage`
- `src/services/usageTracking.ts:80` — `const { error: funcError } = await supabase.rpc('get_or_create_usage', {`
- `src/services/usageTracking.ts:143` — `const { error: funcError } = await supabase.rpc('get_or_create_usage', {`

---

## Unknown Env Var References

These env vars are read in source but not in the known-required list. Review for missing documentation or typos.

- `ADMIN_EMAIL`
- `ADMIN_USER_ID`
- `API_ENV`
- `API_URL`
- `DEV_AI_FALLBACK`
- `DISABLE_AUTH_FOR_DEV`
- `DISABLE_CSRF`
- `DISABLE_RATE_LIMIT`
- `ENABLE_API_DOCS`
- `ENABLE_EXPERIMENTAL`
- `ENCRYPTION_SALT`
- `EPISODIC_CLOSURE_DAYS`
- `FREE_TIER_AI_LIMIT`
- `FREE_TIER_ENTRY_LIMIT`
- `GITHUB_API_TOKEN`
- `GITHUB_TOKEN`
- `MICROSOFT_CLIENT_ID`
- `MICROSOFT_CLIENT_SECRET`
- `MICROSOFT_REDIRECT_URI`
- `MICROSOFT_TENANT_ID`
- `OPENAI_API_MODEL`
- `OPENAI_EMBEDDING_MODEL`
- `OPENAI_MODEL`
- `STRIPE_API_KEY`
- `STRIPE_PUBLISHABLE_KEY`
- `SUBSCRIPTION_PRICE_ID`
- `TWITTER_BEARER_TOKEN`
- `VITEST`
- `VITE_API_URL`
- `VITE_OPENAI_API_KEY`
- `VITE_SUPABASE_SERVICE_ROLE_KEY`
- `X_API_BEARER_TOKEN`

---

## @ts-ignore / @ts-expect-error Suppressions

_None detected._

---

## Unsafe `as any` Usages (first 30)

- `src/controllers/chaptersController.ts:46`
- `src/db/dbAdapter.ts:6`
- `src/db/schemaVerification.ts:48`
- `src/db/supabaseMock.ts:5`
- `src/db/supabaseMock.ts:7`
- `src/db/supabaseMock.ts:14`
- `src/db/supabaseMock.ts:22`
- `src/engineRuntime/contextBuilder.ts:55`
- `src/engineRuntime/contextBuilder.ts:67`
- `src/engineRuntime/contextBuilder.ts:79`
- `src/engineRuntime/engineRegistry.ts:237`
- `src/engineRuntime/orchestrator.ts:156`
- `src/engineRuntime/orchestrator.ts:276`
- `src/engineRuntime/types.ts:6`
- `src/engineRuntime/types.ts:7`
- `src/engineRuntime/types.ts:8`
- `src/engineRuntime/types.ts:9`
- `src/engineRuntime/types.ts:18`
- `src/engineRuntime/types.ts:27`
- `src/er/writeRelationship.ts:78`
- `src/external/external_hub.router.ts:24`
- `src/external/external_hub.service.ts:44`
- `src/harmonization/harmonization.service.ts:6`
- `src/harmonization/harmonization.service.ts:7`
- `src/harmonization/harmonization.service.ts:11`
- `src/harmonization/harmonization.service.ts:13`
- `src/harmonization/harmonization.service.ts:15`
- `src/harmonization/harmonization.service.ts:23`
- `src/harmonization/harmonization.service.ts:34`
- `src/integrations/github/github.router.ts:20`

_...and 1253 more._

---

## console.log in Production Code (first 20)

- `src/config.ts:119` — `console.error(`\n⚠️  Missing or placeholder environment variables: ${missing.join(', ')}`);`
- `src/config.ts:120` — `console.error('⚠️  Backend will start but authentication and API features will not work.');`
- `src/config.ts:121` — `console.error('\n📝 To fix:');`
- `src/config.ts:122` — `console.error('   1. Get your Supabase Service Role Key from: https://supabase.com/dashboard/project/cshtthzpgkmrbcsfghyq/settings/api');`
- `src/config.ts:123` — `console.error('   2. Get your OpenAI API Key from: https://platform.openai.com/api-keys');`
- `src/config.ts:124` — `console.error('   3. Update your .env file with the real values\n');`
- `src/middleware/auth.ts:24` — `console.warn('Failed to create Supabase client:', error);`
- `src/middleware/auth.ts:48` — `console.error('[Auth] CRITICAL: DISABLE_AUTH_FOR_DEV=true detected in production. Refusing request.');`
- `src/middleware/auth.ts:56` — `console.info('[Auth] DEV_AUTH_BYPASS active — all requests use dev-user 00000000. Set DISABLE_AUTH_FOR_DEV=false to require real auth.');`
- `src/middleware/auth.ts:111` — `console.error('Auth middleware error:', error);`
- `src/middleware/subscription.ts:151` — `console.error('Error attaching usage data:', error);`
- `src/routes/chapters.ts:143` — `console.error('Failed to extract chapter info:', error);`
- `src/routes/routeRegistry.ts:1232` — `console.error('❌ Route registry validation failed at module load:');`
- `src/routes/routeRegistry.ts:1233` — `validation.errors.forEach((e) => console.error(`  - ${e}`));`
- `src/routes/routeRegistry.ts:1234` — `console.warn('⚠️  Server will continue, but routes may not work correctly');`
- `src/routes/routeRegistry.ts:1236` — `console.log(`✅ Route registry validated: ${routeRegistry.length} routes registered`);`
- `src/routes/subscription.ts:58` — `console.error('Error getting subscription status:', error);`
- `src/routes/subscription.ts:76` — `console.error('Error getting usage:', error);`
- `src/routes/subscription.ts:120` — `console.error('Error creating subscription:', error);`
- `src/routes/subscription.ts:153` — `console.error('Error canceling subscription:', error);`

_...and 9 more._

---

## Routes Without Auth Middleware

- `src/routes/behavior.ts`
- `src/routes/beliefRealityReconciliation.ts`
- `src/routes/conflicts.ts`
- `src/routes/contradictionAlerts.ts`
- `src/routes/emotionalIntelligence.ts`
- `src/routes/engineRuntime.ts`
- `src/routes/entityAmbiguity.ts`
- `src/routes/entityMeaningDrift.ts`
- `src/routes/identityCore.ts`
- `src/routes/innerMythology.ts`
- `src/routes/integrations.ts`
- `src/routes/knowledgeTypeEngine.ts`
- `src/routes/legal.ts`
- `src/routes/narrativeDiff.ts`
- `src/routes/scenes.ts`
- `src/routes/socialProjection.ts`
- `src/routes/toxicity.ts`

> Note: Public routes legitimately have no auth. Review this list and mark intended public routes with `requiresAuth: false` in routeRegistry.ts.

---

## Potential Orphan Services (sample, max 20)

- `src/services/activeLearning/modelFineTuner.ts`
- `src/services/compiler/canonService.ts`
- `src/services/compiler/incrementalCompiler.ts`
- `src/services/compiler/ndie.ts`
- `src/services/compiler/test-data/classification-samples.ts`
- `src/services/continuity/resolutionService.ts`
- `src/services/conversationCentered/batchProcessor.ts`
- `src/services/conversationCentered/experienceClusterer.ts`
- `src/services/conversationCentered/hybridExtractor.ts`
- `src/services/encryption.ts`
- `src/services/encryptionService.ts`
- `src/services/paracosm/paracosmClassifier.ts`
- `src/services/paracosm/paracosmExtractor.ts`
- `src/services/paracosm/paracosmGraphBuilder.ts`
- `src/services/paracosm/paracosmScoring.ts`
- `src/services/paracosm/paracosmStorage.ts`
- `src/services/rag/semanticChunker.ts`
- `src/services/rpg/discoverySystem.ts`
- `src/services/rpg/reflectionPrompts.ts`
- `src/services/rpg/rpgProcessor.ts`

> Note: This is a heuristic — a service not found by filename search may still be imported via index barrel.

---

## TypeScript Error Count Over Time

| Date | Error Count | CORE_RUNTIME Errors |
|------|------------|---------------------|
| 2026-05-26 | 521 | 0 |

> Track this table to measure stabilization progress.
