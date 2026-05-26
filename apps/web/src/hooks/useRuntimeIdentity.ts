// useRuntimeIdentity — primary consumer API for runtime identity semantics.
//
// Replaces scattered checks like:
//   isMockDataEnabled, isGuest, runtimeDataMode === 'REAL'
//
// With explicit, readable identity guards:
//   identity.is.realUser, identity.can.writeToDb, identity.capabilities.provenanceEdges

import { useMemo } from 'react';
import { useMockData } from '../contexts/MockDataContext';
import {
  getRuntimeCapabilities,
  runtimeGuards,
  type RuntimeIdentityType,
  type RuntimeCapabilities,
} from '../lib/runtimeIdentity';

export interface RuntimeIdentityHandle {
  /** Canonical runtime classification. */
  identity: RuntimeIdentityType;
  /** Full capabilities for this runtime. Use for detailed guards. */
  capabilities: RuntimeCapabilities;
  /** Shorthand identity predicates. */
  is: {
    realUser:  boolean; // authenticated, governed, full pipeline
    guest:     boolean; // ephemeral sandbox, local-only, no auth
    demo:      boolean; // synthetic showcase, no auth, no DB
    degraded:  boolean; // authenticated but backend offline
  };
  /** Common capability guards — avoid reading capabilities directly when these suffice. */
  can: {
    writeToDb:          boolean;
    persistProvenance:  boolean;
    ingest:             boolean;
    consolidate:        boolean;
    governTruth:        boolean;
  };
  /** Whether this runtime requires an auth session. */
  needsAuth:  boolean;
  /** Whether this runtime must accept ToS before proceeding. */
  needsTerms: boolean;
}

export function useRuntimeIdentity(): RuntimeIdentityHandle {
  const { runtimeIdentity } = useMockData();

  return useMemo<RuntimeIdentityHandle>(() => {
    const capabilities = getRuntimeCapabilities(runtimeIdentity);
    return {
      identity: runtimeIdentity,
      capabilities,
      is: {
        realUser: runtimeIdentity === 'REAL_USER',
        guest:    runtimeIdentity === 'GUEST_USER',
        demo:     runtimeIdentity === 'DEMO_RUNTIME',
        degraded: runtimeIdentity === 'DEGRADED_RUNTIME',
      },
      can: {
        writeToDb:         runtimeGuards.canWriteToDb(runtimeIdentity),
        persistProvenance: runtimeGuards.canPersistProvenance(runtimeIdentity),
        ingest:            runtimeGuards.canIngest(runtimeIdentity),
        consolidate:       runtimeGuards.canConsolidate(runtimeIdentity),
        governTruth:       runtimeGuards.isGovernedRuntime(runtimeIdentity),
      },
      needsAuth:  runtimeGuards.needsAuth(runtimeIdentity),
      needsTerms: runtimeGuards.needsTerms(runtimeIdentity),
    };
  }, [runtimeIdentity]);
}
