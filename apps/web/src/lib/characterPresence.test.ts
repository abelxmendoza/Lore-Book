import { describe, expect, it } from 'vitest';
import type { Character } from '../components/characters/CharacterProfileCard';
import {
  closenessBandLabel,
  formatPresenceLastSeen,
  indexCharacterPresence,
  normalizeRecency01,
  resolveCharacterPresence,
} from './characterPresence';

function char(partial: Partial<Character> = {}): Character {
  return { id: 'c1', name: 'Jamie', ...partial };
}

describe('resolveCharacterPresence', () => {
  it('does not treat a default minor card as dormant at 0 closeness', () => {
    const presence = resolveCharacterPresence(char({ importance_level: 'minor', importance_score: 0 }));
    expect(presence.closeness).toBeNull();
    expect(presence.phase).toBeNull();
  });

  it('uses the strongest real signal, not a weak default', () => {
    const presence = resolveCharacterPresence(
      char({
        importance_level: 'minor',
        importance_score: 20,
        relationship_depth: 'close',
      }),
    );
    expect(presence.closeness).toBe(80);
    expect(presence.phase).toBe('active');
  });

  it('uses analytics when present, including 0–100 recency', () => {
    const presence = resolveCharacterPresence(
      char({
        analytics: {
          closeness_score: 88,
          relationship_depth: 80,
          interaction_frequency: 70,
          recency_score: 80,
          character_influence_on_user: 70,
          user_influence_over_character: 40,
          importance_score: 80,
          priority_score: 70,
          relevance_score: 70,
          value_score: 70,
          sentiment_score: 60,
          trust_score: 70,
          support_score: 70,
          conflict_score: 10,
          engagement_score: 70,
          activity_level: 70,
          shared_experiences: 12,
          relationship_duration_days: 400,
          trend: 'deepening',
        },
      }),
    );
    expect(presence.phase).toBe('core');
    expect(presence.closeness).toBe(88);
  });

  it('treats an explicit zero closeness as dormant', () => {
    expect(resolveCharacterPresence(char({ metadata: { closeness_score: 0 } })).phase).toBe('dormant');
  });

  it('uses last perception for recency without calling everyone recently updated', () => {
    const presence = resolveCharacterPresence(
      char({
        relationship_depth: 'close',
        last_perception_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    );
    expect(presence.recency).toBe(1);
    expect(presence.phase).toBe('core');
  });

  it('does not treat updated_at as last seen', () => {
    const presence = resolveCharacterPresence(char({ updated_at: new Date().toISOString() }));
    expect(presence.recency).toBeNull();
    expect(presence.lastSeenAt).toBeNull();
    expect(presence.phase).toBeNull();
  });

  it('bumps closeness from mention volume without inventing a core relationship', () => {
    const presence = resolveCharacterPresence(
      char({ importance_level: 'minor', memory_count: 2, perception_count: 2 }),
    );
    expect(presence.closeness).toBeGreaterThanOrEqual(16);
    expect(presence.closeness).toBeLessThanOrEqual(50);
    expect(presence.phase).toBe('fading');
  });
});

describe('presence helpers', () => {
  it('keeps 0–1 demo scores and scales 0–100 analytics', () => {
    expect(normalizeRecency01(0.9)).toBe(0.9);
    expect(normalizeRecency01(80)).toBe(0.8);
  });

  it('labels closeness bands', () => {
    expect(closenessBandLabel(88)).toBe('Close');
    expect(closenessBandLabel(12)).toBe('Distant');
    expect(closenessBandLabel(null)).toBeNull();
  });

  it('formats last seen in short language', () => {
    const now = Date.parse('2026-08-16T20:00:00.000Z');
    expect(formatPresenceLastSeen('2026-08-16T12:00:00.000Z', now)).toBe('today');
    expect(formatPresenceLastSeen('2026-08-13T12:00:00.000Z', now)).toBe('3d ago');
  });

  it('indexes a roster once', () => {
    const byId = indexCharacterPresence([
      char({ id: 'a', relationship_depth: 'close' }),
      char({ id: 'b', name: 'Alex' }),
    ]);
    expect(byId.get('a')?.closeness).toBe(80);
    expect(byId.get('b')?.phase).toBeNull();
  });
});
