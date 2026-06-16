// ─── Runtime Identity Service ─────────────────────────────────────────────────
//
// Canonical runtime classification for LoreBook.
//
// Runtime identity is a FIRST-CLASS system concept, not a scattered boolean.
// Every capability decision — auth gates, persistence writes, provenance edges,
// terms checks — must derive from a single resolved RuntimeIdentityType.
//
// Resolution priority (highest wins):
//   DEMO_RUNTIME    isMockDataEnabled is true (explicit demo flag)
//   REAL_USER       authenticated + backend healthy
//   DEGRADED_RUNTIME authenticated + backend unavailable
//   GUEST_USER      unauthenticated, non-demo (default)
//
// ─────────────────────────────────────────────────────────────────────────────

// ─── Core type ────────────────────────────────────────────────────────────────

export type RuntimeIdentityType =
  | 'REAL_USER'
  | 'GUEST_USER'
  | 'DEMO_RUNTIME'
  | 'DEGRADED_RUNTIME';

// ─── Capabilities matrix ──────────────────────────────────────────────────────

export interface RuntimeCapabilities {
  // Access control
  authRequired: boolean;
  termsAcceptance: boolean;

  // Persistence authority
  canonicalDBWrites: boolean;
  localPersistence: boolean;

  // Cognition pipeline
  ingestion: boolean;
  consolidation: boolean;
  pipelineRuns: boolean;
  provenanceEdges: boolean;

  // Data quality tiers
  entityExtraction: 'full' | 'local-only' | 'synthetic' | 'cached';
  retrieval: 'governed' | 'local' | 'seeded' | 'cached';
  truthGovernance: 'full' | 'minimal' | 'synthetic' | 'cached';
  persistenceTier: 'canonical-db' | 'local-only' | 'synthetic' | 'cached';
}

export const RUNTIME_CAPABILITIES: Record<RuntimeIdentityType, RuntimeCapabilities> = {
  // ── REAL_USER ────────────────────────────────────────────────────────────
  // Canonical autobiographical runtime. Full governance, all pipelines active.
  REAL_USER: {
    authRequired:      true,
    termsAcceptance:   true,
    canonicalDBWrites: true,
    localPersistence:  true,
    ingestion:         true,
    consolidation:     true,
    pipelineRuns:      true,
    provenanceEdges:   true,
    entityExtraction:  'full',
    retrieval:         'governed',
    truthGovernance:   'full',
    persistenceTier:   'canonical-db',
  },

  // ── GUEST_USER ───────────────────────────────────────────────────────────
  // Ephemeral sandbox. No account, no DB writes, local-only cognition.
  // Exploring without commitment. No ToS wall (nothing to record against).
  GUEST_USER: {
    authRequired:      false,
    termsAcceptance:   false,
    canonicalDBWrites: false,
    localPersistence:  true,
    ingestion:         false,
    consolidation:     false,
    pipelineRuns:      false,
    provenanceEdges:   false,
    entityExtraction:  'local-only',
    retrieval:         'local',
    truthGovernance:   'minimal',
    persistenceTier:   'local-only',
  },

  // ── DEMO_RUNTIME ─────────────────────────────────────────────────────────
  // Fully isolated showcase. Synthetic cognition, no auth, no DB writes.
  // Public portfolio mode — works without backend.
  DEMO_RUNTIME: {
    authRequired:      false,
    termsAcceptance:   false,
    canonicalDBWrites: false,
    localPersistence:  false,
    ingestion:         false,
    consolidation:     false,
    pipelineRuns:      false,
    provenanceEdges:   false,
    entityExtraction:  'synthetic',
    retrieval:         'seeded',
    truthGovernance:   'synthetic',
    persistenceTier:   'synthetic',
  },

  // ── DEGRADED_RUNTIME ─────────────────────────────────────────────────────
  // Authenticated user, backend temporarily unreachable. Read from cache,
  // queue writes for reconciliation. Reduced guarantees, no new provenance.
  DEGRADED_RUNTIME: {
    authRequired:      false,  // already authenticated; don't re-gate
    termsAcceptance:   false,
    canonicalDBWrites: false,
    localPersistence:  true,
    ingestion:         false,
    consolidation:     false,
    pipelineRuns:      false,
    provenanceEdges:   false,
    entityExtraction:  'cached',
    retrieval:         'cached',
    truthGovernance:   'cached',
    persistenceTier:   'cached',
  },
};

// ─── Resolution ───────────────────────────────────────────────────────────────

export interface RuntimeIdentityResolutionInput {
  isAuthenticated: boolean;
  isGuest: boolean;
  isMockDataEnabled: boolean;
  backendUnavailable: boolean;
}

export function resolveRuntimeIdentity(
  input: RuntimeIdentityResolutionInput
): RuntimeIdentityType {
  // DEMO wins unconditionally — explicit mock flag overrides auth state.
  // Prevents authenticated users who toggle mock data from bleeding real writes.
  if (input.isMockDataEnabled) return 'DEMO_RUNTIME';

  // Authenticated + healthy backend → canonical runtime.
  if (input.isAuthenticated && !input.backendUnavailable) return 'REAL_USER';

  // Authenticated + backend down → degraded continuation.
  if (input.isAuthenticated && input.backendUnavailable) return 'DEGRADED_RUNTIME';

  // Everyone else (unauthenticated, non-demo) is an ephemeral guest.
  return 'GUEST_USER';
}

// ─── Capability accessors ─────────────────────────────────────────────────────

export function getRuntimeCapabilities(identity: RuntimeIdentityType): RuntimeCapabilities {
  return RUNTIME_CAPABILITIES[identity];
}

export const runtimeGuards = {
  needsAuth:             (id: RuntimeIdentityType) => RUNTIME_CAPABILITIES[id].authRequired,
  needsTerms:            (id: RuntimeIdentityType) => RUNTIME_CAPABILITIES[id].termsAcceptance,
  canWriteToDb:          (id: RuntimeIdentityType) => RUNTIME_CAPABILITIES[id].canonicalDBWrites,
  canPersistProvenance:  (id: RuntimeIdentityType) => RUNTIME_CAPABILITIES[id].provenanceEdges,
  canIngest:             (id: RuntimeIdentityType) => RUNTIME_CAPABILITIES[id].ingestion,
  canConsolidate:        (id: RuntimeIdentityType) => RUNTIME_CAPABILITIES[id].consolidation,
  isEphemeral:           (id: RuntimeIdentityType) => !RUNTIME_CAPABILITIES[id].canonicalDBWrites,
  isGovernedRuntime:     (id: RuntimeIdentityType) => id === 'REAL_USER',
};

// ─── Global imperative accessor ───────────────────────────────────────────────
// For use outside React (fetchJson, provenance services, ingestion queue).
// Set by MockDataContext on every re-render that changes identity.

let _globalRuntimeIdentity: RuntimeIdentityType = 'GUEST_USER';

export function getGlobalRuntimeIdentity(): RuntimeIdentityType {
  return _globalRuntimeIdentity;
}

export function setGlobalRuntimeIdentity(identity: RuntimeIdentityType): void {
  _globalRuntimeIdentity = identity;
}

/** True only for authenticated users on a healthy backend — safe for protected /api reads. */
export function canCallAuthenticatedApi(): boolean {
  return getGlobalRuntimeIdentity() === 'REAL_USER';
}
