import { describe, expect, it } from 'vitest';

import type { StitchedTimelineItem } from '../chronologyV2/stitchedTimelineService';
import { projectTemporalItemForSurfaces } from '../temporal/temporalSurfaceProjection';
import {
  ORGANIZATION_DATE_FIELD_AUTHORITY,
  projectOrganizationTimelineFromSources,
  sameTemporalIdentity,
} from './organizationEntityTimelineService';
import { attributeOrganizationsInEvent } from './organizationEventAttribution';

const LA = 'America/Los_Angeles';
const NOW = new Date('2026-08-20T17:00:00Z');
const ACME = 'org-acme';

function stitched(over: Partial<StitchedTimelineItem> & Pick<StitchedTimelineItem, 'id'>): StitchedTimelineItem {
  const sourceId = over.sourceId ?? over.id.replace(/^event:/, '');
  return {
    kind: 'event',
    sourceId,
    sourceIds: over.sourceIds ?? [sourceId],
    sourceKind: 'resolved_event',
    sourceType: 'resolved_event',
    sortTime: over.occurredAt ?? '2026-08-20T12:00:00.000Z',
    userSortIndex: null,
    title: 'Started at Acme',
    body: '',
    timePrecision: 'date',
    occurrenceStatus: 'confirmed',
    userPresence: 'attended',
    occurredAt: '2026-08-20T12:00:00.000Z',
    ...over,
  };
}

describe('organization entity timeline', () => {
  it('occurrence authority is canonical, not member overlap or legacy dates', () => {
    expect(ORGANIZATION_DATE_FIELD_AUTHORITY.occurrence).toBe('canonical_temporal_model.occurred');
    expect(ORGANIZATION_DATE_FIELD_AUTHORITY.legacyEventDate).toBe('compatibility_not_occurrence');
    expect(ORGANIZATION_DATE_FIELD_AUTHORITY.memberOverlap).toBe('not_event_attribution');
  });

  it('Omni, Calendar, and Organization modal share canonical ID and local day', () => {
    const attributions = attributeOrganizationsInEvent({
      text: 'I started working at Acme.',
      organizations: [{ id: ACME, name: 'Acme' }],
    });
    const item = stitched({
      id: 'event:acme-start',
      occurredAt: '2026-08-10T18:00:00.000Z',
      organizationAttributions: attributions,
    });
    const { omni, calendar, entityModal } = projectTemporalItemForSurfaces(item, LA, NOW);
    const modal = projectOrganizationTimelineFromSources({
      entityId: ACME,
      timezone: LA,
      now: NOW,
      stitchedItems: [item],
    });
    const shown = [...modal.sharedExperiences, ...modal.lore][0];
    expect(sameTemporalIdentity(omni, calendar)).toBe(true);
    expect(sameTemporalIdentity(omni, entityModal)).toBe(true);
    expect(sameTemporalIdentity(omni, {
      canonicalItemId: shown!.canonicalItemId,
      occurredStart: shown!.occurredStart,
      userLocalStartDay: shown!.userLocalStartDay,
    })).toBe(true);
    expect(shown?.attributionRole).toBe('employer');
    expect(shown?.attributionDirect).toBe(true);
  });

  it('legacy entity_timeline_events dates cannot override canonical occurrence', () => {
    const item = stitched({
      id: 'event:canonical',
      sourceId: 'evt-1',
      sourceIds: ['evt-1'],
      occurredAt: '2026-08-01T18:00:00.000Z',
    });
    const modal = projectOrganizationTimelineFromSources({
      entityId: ACME,
      timezone: LA,
      now: NOW,
      stitchedItems: [item],
      legacyRows: [{
        id: 'legacy-1',
        event_id: 'evt-1',
        event_title: 'Started at Acme',
        event_date: '1999-01-01T00:00:00.000Z',
      }],
    });
    expect(modal.sharedExperiences[0]?.occurredStart).toBe('2026-08-01T18:00:00.000Z');
    expect(modal.legacyOnly).toHaveLength(0);
  });

  it('unmatched dated legacy rows are not chronology', () => {
    const modal = projectOrganizationTimelineFromSources({
      entityId: ACME,
      timezone: LA,
      now: NOW,
      stitchedItems: [],
      legacyRows: [{
        id: 'legacy-dated',
        event_id: 'evt-ghost',
        event_title: 'Invented all-hands',
        event_date: '1999-01-01T00:00:00.000Z',
      }],
    });
    expect(modal.sharedExperiences).toHaveLength(0);
    expect(modal.compatibilityReview[0]?.reason).toBe('legacy_unmatched');
    expect(modal.compatibilityReview[0]).toMatchObject({
      entityId: ACME,
      creationPath: 'resolved_event',
      canonicalMatch: false,
      dateVerified: false,
      hasLegacyDate: true,
      label: 'Legacy record — date not verified',
    });
  });

  it('unresolved temporal items stay unresolved', () => {
    const modal = projectOrganizationTimelineFromSources({
      entityId: ACME,
      timezone: LA,
      now: NOW,
      unresolvedItems: [stitched({
        id: 'event:undated',
        occurredAt: null,
        timePrecision: 'unknown',
        occurrenceStatus: 'unresolved',
        projectionRole: 'unresolved',
      })],
    });
    expect(modal.unresolved[0]?.occurredStart).toBeNull();
    expect(modal.sharedExperiences).toHaveLength(0);
  });
});
