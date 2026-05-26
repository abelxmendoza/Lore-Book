/**
 * Experimental Runtime Boundary
 *
 * This directory will contain systems loaded only when
 * ENABLE_EXPERIMENTAL_RUNTIME=true.
 *
 * Requirements for code in this boundary:
 *   - Must not be imported by anything in src/core/
 *   - May have TS errors while under development
 *   - Feature-gated at route registration in routeRegistry.ts
 *   - Feature-gated at job registration in src/index.ts
 *
 * Migration is incremental. For now, experimental routes and services
 * remain in their original locations (src/routes/, src/services/).
 * Move here as boundaries solidify.
 *
 * Current experimental systems:
 *   - Domain cognition workers (src/workers/)
 *   - Engine runtime (src/engineRuntime/)
 *   - Experimental jobs (src/jobs/ — see runtime-classification.md)
 *   - 90+ experimental routes (see routeRegistry.ts)
 */

export {};
