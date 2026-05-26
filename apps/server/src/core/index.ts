/**
 * Core Runtime Boundary
 *
 * This directory contains systems that are ALWAYS active in production.
 * Code here must:
 *   - Have no dependency on src/experimental, src/research, or src/legacy
 *   - Be fully type-safe (no suppressed errors)
 *   - Have integration test coverage
 *   - Boot without ENABLE_EXPERIMENTAL_RUNTIME
 *
 * Current core systems (still in src/ root — migration is incremental):
 *   - Auth middleware       → src/middleware/auth.ts
 *   - Chat service          → src/services/chat/
 *   - Thread persistence    → src/services/threads/
 *   - Entity extraction     → src/services/entities/
 *   - Memory recall         → src/services/memoryRecall/
 *   - Continuity engine     → src/services/continuity/
 *   - Ingestion pipeline    → src/services/ingestion/
 *   - Provenance            → src/services/provenance/
 *   - Contradiction/Canon   → src/routes/corrections, canon, contradiction-alerts
 *   - DB adapter            → src/db/dbAdapter.ts
 *   - Config                → src/config.ts
 *
 * As systems are validated and stabilized, move them here and update imports.
 */

export {};
