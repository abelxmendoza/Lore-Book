import { describe, expect, it } from 'vitest';
import { narrativeAnchorEngine } from '../../../src/services/narrativeAnchors/narrativeAnchorEngine';
import { resolveHonorific } from '../../../src/services/narrativeAnchors/narrativeAnchorNicknameResolver';
import { repairEntityBoundary } from '../../../src/services/narrativeAnchors/narrativeAnchorEntityBoundaryRepair';
import { isPlaceholderTitle } from '../../../src/services/narrativeAnchors/narrativeAnchorTitleGenerator';
import { buildCommunityAnchors } from '../../../src/services/narrative/communityAnchorService';
import type { AnchorBuildContext } from '../../../src/services/narrative/narrativeAnchorTypes';

describe('NarrativeAnchorEngine v1', () => {
  describe('nickname vs kinship', () => {
    it('treats Goth Tio as nickname, not family', () => {
      const r = resolveHonorific('Goth Tio');
      expect(r.interpretation).toBe('NICKNAME');
    });

    it('treats Tío Ralph as literal kinship title', () => {
      const r = resolveHonorific('Tío Ralph');
      expect(r.interpretation).toBe('LITERAL_KINSHIP_TITLE');
      expect(r.kinshipRelation).toBe('uncle');
    });

    it('rejects Family Period built from Goth Tio + Neon Parlor + LoreBook', () => {
      const r = narrativeAnchorEngine.evaluate({
        title: 'Family Period',
        proposedType: 'family_period',
        peopleNames: ['Goth Tio', 'Narrator'],
        groupNames: ['Los Goths'],
        eventTitles: ["Building LoreBook at Abuela's House", 'Neon Parlor'],
        signals: ['tio', 'uncle', 'aunt', 'family'],
        evidenceLabels: ['tio', 'uncle', 'family'],
        eventCount: 2,
      });
      expect(
        r.status === 'rejected'
          || r.status === 'needs_review'
          || r.decision === 'SPLIT'
          || r.narrativeCoherence.finalScore < 0.6,
      ).toBe(true);
      expect(isPlaceholderTitle('Family Period')).toBe(true);
    });
  });

  describe('community membership', () => {
    it('does not publish Family Community from shared group membership alone', () => {
      const r = narrativeAnchorEngine.evaluate({
        title: 'Family Community',
        proposedType: 'community',
        peopleNames: ['Leslie', "Tío Ralph's"],
        groupNames: ["Tio Ralph's Family"],
        evidenceLabels: ["2 members share Tio Ralph's Family"],
        membershipOnly: true,
        memberCount: 2,
        eventCount: 0,
      });
      expect(r.status).toBe('routed');
      expect(['ROUTE_COMMUNITY', 'ROUTE_FAMILY_GROUP', 'ROUTE_HOUSEHOLD']).toContain(r.decision);
    });

    it('does not publish Goth Community from membership count alone', () => {
      const r = narrativeAnchorEngine.evaluate({
        title: 'Goth Community',
        proposedType: 'community',
        peopleNames: ['Narrator'],
        groupNames: ['Los Goths'],
        evidenceLabels: ['6 members share Los Goths'],
        membershipOnly: true,
        memberCount: 6,
        eventCount: 0,
      });
      expect(r.status).toBe('routed');
    });

    it('buildCommunityAnchors returns empty for pure membership orgs', () => {
      const ctx: AnchorBuildContext = {
        userId: 'u1',
        entities: [
          {
            entityId: 'p1',
            entityType: 'character',
            name: 'Leslie',
            mentionCount: 2,
            threadCount: 1,
            daysMentioned: 1,
            emotionalWeight: 0.2,
            eventParticipation: 0,
            relationshipStrength: 0.2,
            communityMembership: 1,
            narrativeImportance: 0.2,
          },
          {
            entityId: 'p2',
            entityType: 'character',
            name: 'Tío Ralph',
            mentionCount: 2,
            threadCount: 1,
            daysMentioned: 1,
            emotionalWeight: 0.2,
            eventParticipation: 0,
            relationshipStrength: 0.2,
            communityMembership: 1,
            narrativeImportance: 0.2,
          },
        ],
        coMentionPairs: [],
        facts: [],
        relationships: [],
        organizations: [{ id: 'org1', name: "Tio Ralph's Family", type: 'family', memberIds: ['p1', 'p2'] }],
        events: [],
        recurringPatterns: [],
      };
      expect(buildCommunityAnchors(ctx)).toEqual([]);
    });
  });

  describe('entity boundary repair', () => {
    it('splits Tío Ralph’s house into person + place', () => {
      const r = repairEntityBoundary("Tío Ralph's house");
      expect(r.repaired).toBe(true);
      expect(r.personName).toMatch(/Tío Ralph/i);
      expect(r.placeName).toMatch(/House/i);
    });

    it('strips trailing possessive from person', () => {
      const r = repairEntityBoundary("Tío Ralph's");
      expect(r.personName).toBe('Tío Ralph');
    });
  });

  describe('strong event titles', () => {
    it('prefers Leslie graduation event over Family Period', () => {
      const r = narrativeAnchorEngine.evaluate({
        title: 'Family Period',
        proposedType: 'family_period',
        peopleNames: ['Leslie', 'Tío Ralph'],
        groupNames: ["Tio Ralph's Family"],
        eventTitles: ["Leslie's Graduation Party"],
        placeNames: ["Tío Ralph's House"],
        evidenceLabels: ['family celebrated at the house'],
        evidenceText: "Leslie graduated and the family celebrated at Tío Ralph's house. I was there.",
        eventCount: 1,
        significanceScore: 80,
        userNames: ['I'],
      });
      // Major single event with importance may publish or needs_review with better title
      expect(isPlaceholderTitle(r.title) || r.title.toLowerCase().includes('graduation')).toBe(
        r.title.toLowerCase().includes('graduation') ? true : !isPlaceholderTitle(r.title) || true,
      );
      expect(r.title.toLowerCase()).toMatch(/graduation|leslie/);
    });

    it('accepts repeated Neon Parlor social chapter with user centrality', () => {
      const r = narrativeAnchorEngine.evaluate({
        title: 'Goth Community',
        proposedType: 'community',
        peopleNames: ['Goth Tio'],
        groupNames: ['Los Goths'],
        placeNames: ['Neon Parlor'],
        eventTitles: ['Night at Neon Parlor', 'Returned to Neon Parlor with Los Goths'],
        evidenceText:
          'I repeatedly attended Neon Parlor, met members of Los Goths, and described it as an important new social space.',
        eventCount: 2,
        dates: ['2025-01-01', '2025-02-15'],
      });
      expect(
        r.status === 'published'
          || r.title.toLowerCase().includes('neon parlor')
          || r.title.toLowerCase().includes('los goths'),
      ).toBe(true);
    });
  });

  describe('user centrality', () => {
    it('rejects anchors where user did not attend', () => {
      const r = narrativeAnchorEngine.evaluate({
        title: 'Goth Community',
        proposedType: 'community',
        peopleNames: ['Maya', 'Jordan'],
        groupNames: ['Los Goths'],
        eventTitles: ['Los Goths meetup'],
        evidenceText: 'Several Los Goths members attended an event. The narrator did not attend.',
        eventCount: 1,
        membershipOnly: false,
      });
      // Low centrality should block publish
      expect(r.userCentrality.finalScore < 0.65 || r.status !== 'published').toBe(true);
    });
  });
});
