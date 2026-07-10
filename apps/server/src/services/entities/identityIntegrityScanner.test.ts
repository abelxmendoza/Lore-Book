import { describe, expect, it } from 'vitest';

import { previewIdentityIntegrityRepair } from './identityIntegrityRepairService';
import { analyzeIdentityIntegritySnapshot, type IdentityIntegritySnapshot } from './identityIntegrityScanner';

const emptySnapshot = (): IdentityIntegritySnapshot => ({
  merges: [], entities: [], relationships: [], cognitionMutations: [], identityMutations: [],
});

describe('identity integrity scanner', () => {
  it('finds cross-type historical merges and missing authorization', () => {
    const snapshot = emptySnapshot();
    snapshot.merges.push({
      id: 'merge-1', user_id: 'user-1', source_entity_id: 'prima', target_entity_id: 'james',
      source_entity_type: 'APP', target_entity_type: 'PERSON', reason: 'fuzzy lexical match', metadata: {},
    });
    const findings = analyzeIdentityIntegritySnapshot('user-1', snapshot);
    expect(findings.map((item) => item.findingType)).toEqual(expect.arrayContaining([
      'CROSS_TYPE_IDENTITY_MERGE', 'MISSING_MERGE_AUTHORIZATION',
    ]));
    expect(findings.every((item) => item.userId === 'user-1')).toBe(true);
  });

  it('does not flag a fully authorized compatible merge', () => {
    const snapshot = emptySnapshot();
    snapshot.merges.push({
      id: 'merge-ok', user_id: 'user-1', source_entity_id: 'p1', target_entity_id: 'p2',
      source_entity_type: 'PERSON', target_entity_type: 'CHARACTER', reason: 'User confirmed duplicate',
      metadata: { merge_authorized: true, resolver_version: 'type-safe-v1', evidence_ids: ['message:m1'] },
    });
    expect(analyzeIdentityIntegritySnapshot('user-1', snapshot)).toEqual([]);
  });

  it('detects selected candidates outside the compatible set and orphan references', () => {
    const snapshot = emptySnapshot();
    snapshot.entities.push({
      id: 'china', user_id: 'user-1', type: 'LOCATION', primary_name: 'China', aliases: [],
      metadata: { resolution_trace: { selectedEntityId: 'mr-chino', acceptedCandidates: ['china'] } },
    });
    snapshot.relationships.push({
      id: 'rel-1', user_id: 'user-1', from_entity_id: 'person-x', to_entity_id: 'china', type: 'grew_up_in',
    });
    const findings = analyzeIdentityIntegritySnapshot('user-1', snapshot);
    expect(findings.map((item) => item.findingType)).toEqual(expect.arrayContaining([
      'SELECTED_CANDIDATE_NOT_COMPATIBLE', 'ORPHAN_OR_CROSS_TENANT_REFERENCE',
    ]));
  });

  it('previews deterministic event-semantic repair without destructive changes', () => {
    const snapshot = emptySnapshot();
    snapshot.merges.push({
      id: 'merge-rel', user_id: 'user-1', source_entity_id: 'khalil', target_entity_id: 'prima',
      source_entity_type: 'PERSON', target_entity_type: 'APP', reason: 'Linked Khalil to Prima AI',
      metadata: { operation: 'relationship_creation', evidence_ids: ['message:m1'] },
    });
    const relationFinding = analyzeIdentityIntegritySnapshot('user-1', snapshot)
      .find((item) => item.findingType === 'RELATIONSHIP_AS_IDENTITY_MERGE');
    expect(relationFinding).toBeDefined();
    const plan = previewIdentityIntegrityRepair('user-1', relationFinding!);
    expect(plan.dryRun).toBe(true);
    expect(plan.deterministic).toBe(true);
    expect(plan.action).toBe('SUPERSEDE_MISLABELED_MUTATION');
  });

  it('rejects a repair preview outside the user scope', () => {
    const finding = analyzeIdentityIntegritySnapshot('user-1', {
      ...emptySnapshot(),
      merges: [{
        id: 'm', user_id: 'user-1', source_entity_id: 'a', target_entity_id: 'b',
        source_entity_type: 'PERSON', target_entity_type: 'LOCATION', metadata: {},
      }],
    })[0];
    expect(() => previewIdentityIntegrityRepair('user-2', finding)).toThrow(/outside the explicit user scope/);
  });
});
