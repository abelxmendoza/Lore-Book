/**
 * Tests for Current Occupation / Role Resolver
 * Per spec:
 * - detects current role from phrases
 * - org hierarchy (Ring sub of Amazon, team)
 * - transitions (unemployed -> current)
 * - blocks role titles as Characters
 * - evidence attached
 * - updates biography
 */

import { extractRoleFromText } from './roleInferenceService';
import { resolveWorkStatus } from './workStatusResolver';
import { resolveOrganizationHierarchy } from '../../organizations/inference/organizationHierarchyResolver';
import { createCurrentRoleSnapshot } from '../../career/currentRoleSnapshotService';
import { evaluateWrongDomain } from '../../characters/audit/wrongDomainCharacterGuard';

describe('Current Occupation / Role Resolver', () => {
  it('detects "currently working at Amazon as a Quality Assurance Technician" as current role', () => {
    const text = 'currently working at Amazon as a Quality Assurance Technician';
    const role = extractRoleFromText(text);
    expect(role?.displayTitle).toMatch(/Quality Assurance Technician/i);

    const status = resolveWorkStatus(text);
    expect(status.status).toBe('current');

    const hierarchies = resolveOrganizationHierarchy('working at Ring a sub company of Amazon');
    const snapshot = createCurrentRoleSnapshot({
      text: 'currently working at Ring a sub company of Amazon as a Quality Assurance Technician',
      role,
      employer: 'Ring',
      hierarchies,
      evidence: [text],
    });
    expect(snapshot?.title).toMatch(/Quality Assurance Technician/);
    expect(snapshot?.organization).toBe('Ring');
    expect(snapshot?.parentOrganization).toBe('Amazon');
    expect(snapshot?.status).toBe('current');
    expect(snapshot?.evidenceQuotes.length).toBeGreaterThan(0);
  });

  it('"Ring a sub company of Amazon" creates org hierarchy', () => {
    const hierarchies = resolveOrganizationHierarchy('Ring a sub company of Amazon');
    expect(hierarchies.some(h => h.name.toLowerCase().includes('ring') && h.parent?.toLowerCase().includes('amazon'))).toBe(true);
  });

  it('"Failure Analysis and Prototypes Team" creates team', () => {
    const hierarchies = resolveOrganizationHierarchy('Failure Analysis and Prototypes Team at Ring');
    expect(hierarchies.some(h => h.name.includes('Failure Analysis') && h.type === 'team')).toBe(true);
  });

  it('old unemployed status becomes former timeline state, new role current', () => {
    const oldText = 'I used to work but now unemployed';
    const newText = 'currently working at Amazon as a Quality Assurance Technician';
    const oldStatus = resolveWorkStatus(oldText);
    const newStatus = resolveWorkStatus(newText);
    expect(oldStatus.status).toBe('former');
    expect(newStatus.status).toBe('current');
    // conflict resolution: transition created, not overwrite
  });

  it('Quality Assurance Technician is blocked from Character Book (wrong domain for role title)', () => {
    const result = evaluateWrongDomain('Quality Assurance Technician', 'working as a Quality Assurance Technician at Ring');
    expect(result.wrongDomain).toBe(true);
    expect(result.reason).toMatch(/role|title|Work Role/i);
  });

  it('evidence/provenance is attached to snapshot', () => {
    const snapshot = createCurrentRoleSnapshot({
      text: 'I am currently working at Ring as Quality Assurance Technician. Ring is a sub of Amazon. Team is Failure Analysis and Prototypes Team.',
      evidence: ['explicit chat mention'],
    });
    expect(snapshot?.evidenceQuotes.length).toBeGreaterThan(0);
    expect(snapshot?.confidence).toBeGreaterThan(0.7);
  });

  it('current role updates biography (via snapshot in pipeline)', () => {
    const snapshot = createCurrentRoleSnapshot({
      text: 'my new job is Quality Assurance Technician at Ring (Amazon) Failure Analysis team',
      evidence: ['chat'],
    });
    expect(snapshot).not.toBeNull();
    // In full pipeline, this would be fed to biography atoms / work book
    expect(snapshot?.title).toContain('Quality Assurance');
    expect(snapshot?.organization).toBeTruthy();
  });
});
