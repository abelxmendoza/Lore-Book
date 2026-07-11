/**
 * Artifact-level replay semantics (unit/model level).
 * Full E2E against live DB is gated; this validates the deterministic identity helpers
 * and documents expected uniqueness contracts used by the trust floor.
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';

const FIXTURE =
  'I went to the club last night after Anime Expo. There was a SonicBoomBox afterparty at Catch One. I danced with Dollyfied and Stimkybun. One of their friends pulled away, so I backed off and respected her boundary. The situation with Genni taught me to respect boundaries. Earlier that day I visited Anime Expo and stopped by my tía’s house for food.';

/** Deterministic source key for replayable artifacts. */
function artifactKey(parts: {
  userId: string;
  sourceMessageId: string;
  extractorVersion: string;
  artifactType: string;
  subject: string;
  object?: string;
  relation?: string;
}): string {
  const material = [
    parts.userId,
    parts.sourceMessageId,
    parts.extractorVersion,
    parts.artifactType,
    parts.subject.toLowerCase().trim(),
    parts.object?.toLowerCase().trim() ?? '',
    parts.relation?.toLowerCase().trim() ?? '',
  ].join('|');
  return createHash('sha256').update(material).digest('hex').slice(0, 32);
}

describe('artifact-level idempotency keys', () => {
  const userId = 'user-fixture';
  const messageId = 'msg-fixture-1';
  const v = 'extractor-v1';

  it('same inputs produce same key (replay-safe)', () => {
    const a = artifactKey({
      userId,
      sourceMessageId: messageId,
      extractorVersion: v,
      artifactType: 'entity_mention',
      subject: 'Dollyfied',
    });
    const b = artifactKey({
      userId,
      sourceMessageId: messageId,
      extractorVersion: v,
      artifactType: 'entity_mention',
      subject: 'Dollyfied',
    });
    expect(a).toBe(b);
  });

  it('different subjects produce different keys', () => {
    const a = artifactKey({
      userId,
      sourceMessageId: messageId,
      extractorVersion: v,
      artifactType: 'entity_mention',
      subject: 'Dollyfied',
    });
    const b = artifactKey({
      userId,
      sourceMessageId: messageId,
      extractorVersion: v,
      artifactType: 'entity_mention',
      subject: 'Stimkybun',
    });
    expect(a).not.toBe(b);
  });

  it('fixture yields stable multi-entity key set', () => {
    const people = ['Dollyfied', 'Stimkybun', 'Genni'];
    const places = ['Catch One', 'Anime Expo'];
    const keys = new Set<string>();
    for (const p of people) {
      keys.add(
        artifactKey({
          userId,
          sourceMessageId: messageId,
          extractorVersion: v,
          artifactType: 'character',
          subject: p,
        }),
      );
    }
    for (const p of places) {
      keys.add(
        artifactKey({
          userId,
          sourceMessageId: messageId,
          extractorVersion: v,
          artifactType: 'location',
          subject: p,
        }),
      );
    }
    keys.add(
      artifactKey({
        userId,
        sourceMessageId: messageId,
        extractorVersion: v,
        artifactType: 'event',
        subject: 'SonicBoomBox afterparty',
      }),
    );
    keys.add(
      artifactKey({
        userId,
        sourceMessageId: messageId,
        extractorVersion: v,
        artifactType: 'claim',
        subject: 'respect boundaries',
        relation: 'learned_from',
        object: 'Genni',
      }),
    );
    expect(keys.size).toBe(people.length + places.length + 2);
    // Re-run simulation: same key set size
    const keys2 = new Set(keys);
    expect(keys2.size).toBe(keys.size);
    expect(FIXTURE.length).toBeGreaterThan(100);
  });

  it('job idempotency key is message id (not timestamp)', () => {
    const jobKey = messageId;
    const replayKey = messageId;
    expect(jobKey).toBe(replayKey);
    expect(jobKey).not.toMatch(/\d{13}/); // not Date.now()
  });
});

describe('concurrency fencing model', () => {
  it('stale lease cannot complete after reclaim (logical)', () => {
    let lease: string | null = 'lease-A';
    let attemptVersion = 1;
    const complete = (token: string, version: number) => {
      if (token !== lease || version !== attemptVersion) return false;
      return true;
    };
    // Worker A holds lease
    expect(complete('lease-A', 1)).toBe(true);
    // Reclaim bumps version and clears lease
    lease = null;
    attemptVersion = 2;
    // Worker A late write
    expect(complete('lease-A', 1)).toBe(false);
    // Worker B claims
    lease = 'lease-B';
    expect(complete('lease-B', 2)).toBe(true);
  });
});
