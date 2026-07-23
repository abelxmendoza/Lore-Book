import { describe, expect, it } from 'vitest';

import { planCompositeSplit } from '../../../src/services/place/migration/placeCompositeSplitter';
import { rebuildPersonPlaceLinks } from '../../../src/services/place/migration/placePeopleLinkRebuilder';
import { reclassifyPlaceRecord } from '../../../src/services/place/migration/placeRecordReclassifier';
import { sanitizePlaceTags } from '../../../src/services/place/migration/placeTagSanitizer';
import { resolveTemporalPlaceAlias } from '../../../src/services/place/migration/placeTemporalAliasResolver';
import {
  dedupeVisitEvidence,
  recalculatePlaceVisits,
} from '../../../src/services/place/migration/placeVisitRecalculator';
import { auditPlaceOntology } from '../../../src/services/place/migration/placeOntologyAudit';
import { resolvePlaceCanonical } from '../../../src/services/place/placeCanonicalResolver';

describe('Place Ontology Repair & Migration v1', () => {
  it('moves Electrical Engineering to FIELD_OF_STUDY', () => {
    const plan = reclassifyPlaceRecord({
      placeId: 'p1',
      name: 'Electrical Engineering',
      type: 'place',
    });
    expect(plan.decision).toBe('MOVE_TO_FIELD');
    expect(plan.targetEntityType).toBe('FIELD_OF_STUDY');
  });

  it('moves Uncle Robert\'s Doctor to PERSON', () => {
    const plan = reclassifyPlaceRecord({
      placeId: 'p2',
      name: "Uncle Robert's Doctor",
      type: 'doctor',
    });
    expect(plan.decision).toBe('MOVE_TO_PERSON');
    expect(plan.targetEntityType).toBe('UNRESOLVED_PERSON');
  });

  it('moves Selfie Car to VEHICLE/OBJECT', () => {
    const plan = reclassifyPlaceRecord({
      placeId: 'p3',
      name: 'Selfie Car',
      type: 'car',
    });
    expect(plan.decision).toBe('MOVE_TO_OBJECT');
    expect(plan.targetEntityType).toBe('VEHICLE');
  });

  it('moves goth scene to COMMUNITY', () => {
    const plan = reclassifyPlaceRecord({
      placeId: 'p4',
      name: 'goth scene',
      type: 'scene',
    });
    expect(plan.decision).toBe('MOVE_TO_COMMUNITY');
    expect(plan.targetEntityType).toBe('SOCIAL_SCENE');
  });

  it('routes AX to Anime Expo EVENT', () => {
    const plan = reclassifyPlaceRecord({
      placeId: 'p5',
      name: 'AX',
      type: 'place',
      evidenceText: 'AX was crowded this year.',
    });
    expect(plan.decision).toBe('MOVE_TO_EVENT');
    expect(plan.canonicalTitle).toBe('Anime Expo');
    expect(plan.targetEntityType).toBe('EVENT');
  });

  it('splits Catch One and Neon Lounge into existing places', () => {
    const plan = reclassifyPlaceRecord({
      placeId: 'p6',
      name: 'Catch One and Neon Lounge',
      type: 'club',
      knownPlaceIdsByName: new Map([
        ['catch one', 'loc-catch'],
        ['neon lounge', 'loc-metro'],
      ]),
    });
    expect(plan.decision).toBe('SPLIT');
    expect(plan.splitTargets).toEqual([
      { name: 'Catch One', existingId: 'loc-catch' },
      { name: 'Neon Lounge', existingId: 'loc-metro' },
    ]);

    const split = planCompositeSplit('Catch One and Neon Lounge', [
      { id: 'loc-catch', name: 'Catch One' },
      { id: 'loc-metro', name: 'Neon Lounge' },
    ]);
    expect(split?.archiveComposite).toBe(true);
    expect(split?.parts.map((p) => p.existingId)).toEqual(['loc-catch', 'loc-metro']);
  });

  it('archives Catch One Vibes as invalid Place', () => {
    const plan = reclassifyPlaceRecord({
      placeId: 'p7',
      name: 'Catch One Vibes',
      type: 'club',
    });
    expect(plan.decision).toBe('ARCHIVE_INVALID');
  });

  it('does not count third-party USC education as a user visit', () => {
    const counts = recalculatePlaceVisits('USC', [
      {
        text: 'Marcus graduated from USC. Jamie attended USC last spring.',
        sourceId: 'm1',
        source: 'chat',
      },
    ], ['University of Southern California']);

    expect(counts.mentionCount).toBeGreaterThanOrEqual(1);
    expect(counts.explicitVisitCount).toBe(0);
  });

  it('does not count coworker origin as a China visit', () => {
    const counts = recalculatePlaceVisits('China', [
      {
        text: 'My coworker came from China to join the robotics team.',
        sourceId: 'm2',
        source: 'chat',
      },
    ]);
    expect(counts.mentionCount).toBe(1);
    expect(counts.explicitVisitCount).toBe(0);
  });

  it('dedupes duplicate ingestion of one visit', () => {
    const evidence = dedupeVisitEvidence([
      { text: 'I went to Catch One last night.', sourceId: 'msg-1' },
      { text: 'I went to Catch One last night.', sourceId: 'msg-1' },
    ]);
    expect(evidence).toHaveLength(1);
    const counts = recalculatePlaceVisits('Catch One', evidence);
    expect(counts.explicitVisitCount).toBe(1);
  });

  it('keeps my home as temporal alias rather than permanent Place', () => {
    const plan = reclassifyPlaceRecord({
      placeId: 'p8',
      name: 'My Home',
      type: 'home',
    });
    expect(plan.decision).toBe('DEMOTE_TO_CONTEXT_REFERENCE');
    expect(plan.targetEntityType).toBe('CONTEXT_REFERENCE');

    const alias = resolveTemporalPlaceAlias(
      'my home',
      [{ id: 'abuela', name: "Abuela's House", type: 'private_residence' }],
      'I am staying at Abuela\'s House this month.',
    );
    expect(alias.resolvedPlaceId).toBe('abuela');
    expect(alias.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it('rejects same-message contamination for people links', () => {
    const { kept, removed } = rebuildPersonPlaceLinks(
      'Mile Square Park',
      [
        { name: 'Cyberpunk' },
        { name: 'Sam' },
        { name: 'Marcus', characterId: 'c1', verified: true },
      ],
      [
        'I ran at Mile Square Park while listening to Cyberpunk music with Sam texting me.',
      ],
    );

    expect(removed).toEqual(expect.arrayContaining(['Cyberpunk', 'Sam']));
    expect(kept.map((k) => k.name)).toContain('Marcus');
    expect(kept.find((k) => k.name === 'Sam')).toBeUndefined();
  });

  it('sanitizes contaminated tags away from intrinsic place identity', () => {
    const result = sanitizePlaceTags(
      ['Dancing', 'technology', 'ui', 'design', 'nightlife', 'x-import', 'nightclub'],
      { placeType: 'nightclub' },
    );
    expect(result.groups.activityTags.map((t) => t.toLowerCase())).toContain('dancing');
    expect(result.groups.importedSourceTags.join(' ')).toMatch(/x-import/i);
    expect(result.removedTags.map((t) => t.toLowerCase())).toEqual(
      expect.arrayContaining(['technology', 'ui', 'design']),
    );
    expect(result.groups.intrinsicTags.join(' ').toLowerCase()).toMatch(/nightclub/);
  });

  it('canonicalizes DTLA to Downtown Los Angeles', () => {
    const canon = resolvePlaceCanonical('DTLA');
    expect(canon.canonicalTitle).toBe('Downtown Los Angeles');
    expect(canon.subtype).toBe('district');
  });

  it('audits a mixed registry batch with expected decision classes', () => {
    const plans = auditPlaceOntology([
      { id: '1', name: 'Electrical Engineering', type: 'place' },
      { id: '2', name: 'AX', type: 'place' },
      { id: '3', name: 'Catch One', type: 'nightclub' },
      { id: '4', name: 'Catch One Vibes', type: 'club' },
      { id: '5', name: 'Selfie Car', type: 'car' },
      { id: '6', name: 'goth scene', type: 'scene' },
      { id: '7', name: "Khalil's Desk Neighbor", type: 'desk' },
      { id: '8', name: "Uncle Robert's Doctor", type: 'doctor' },
      { id: '9', name: 'Catch One and Neon Lounge', type: 'club' },
      { id: '10', name: 'Loud House', type: 'house' },
    ]);

    const byName = new Map(plans.map((p) => [p.originalTitle, p.decision]));
    expect(byName.get('Electrical Engineering')).toBe('MOVE_TO_FIELD');
    expect(byName.get('AX')).toBe('MOVE_TO_EVENT');
    expect(byName.get('Catch One')).toBe('KEEP');
    expect(byName.get('Catch One Vibes')).toBe('ARCHIVE_INVALID');
    expect(byName.get('Selfie Car')).toBe('MOVE_TO_OBJECT');
    expect(byName.get('goth scene')).toBe('MOVE_TO_COMMUNITY');
    expect(byName.get("Khalil's Desk Neighbor")).toBe('MOVE_TO_PERSON');
    expect(byName.get("Uncle Robert's Doctor")).toBe('MOVE_TO_PERSON');
    expect(byName.get('Catch One and Neon Lounge')).toBe('SPLIT');
    expect(byName.get('Loud House')).toBe('NEEDS_REVIEW');
  });
});
