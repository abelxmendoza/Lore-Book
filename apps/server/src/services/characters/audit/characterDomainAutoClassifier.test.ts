/**
 * Auto domain classification: the audit's non-hardcoded tiers.
 * Tier 1 delegates to the ingestion pipeline classifier; tier 2 (LLM) is
 * covered via its pure parser and the override mapping.
 */
import { describe, it, expect } from 'vitest';

import {
  pipelineDomain,
  parseLlmClassifications,
  cachedDomain,
} from './characterDomainAutoClassifier';
import { autoDomainOverride } from './characterCardAuditService';
import type { CharacterCardAuditResult } from './characterCardAuditTypes';

describe('pipelineDomain (tier 1 — app pipeline classifier)', () => {
  it('maps glossary apps to tool', () => {
    const result = pipelineDomain('ChatGPT', '');
    expect(result?.domain).toBe('tool');
    expect(result?.source).toBe('pipeline');
  });

  it('maps known companies to group', () => {
    expect(pipelineDomain('Amazon', '')?.domain).toBe('group');
  });

  it('maps possessive dwellings to place', () => {
    expect(pipelineDomain("Mike's House", '')?.domain).toBe('place');
  });

  it('returns null when the pipeline has no confident signal', () => {
    expect(pipelineDomain('Bill Skasby', '')).toBeNull();
  });
});

describe('parseLlmClassifications (tier 2 parser)', () => {
  it('parses valid entries and clamps confidence', () => {
    const raw = JSON.stringify({
      classifications: [
        { id: 'a', domain: 'media', confidence: 1.7, reason: 'anime title' },
        { id: 'b', domain: 'person', confidence: 0.9, reason: 'named human' },
      ],
    });
    const entries = parseLlmClassifications(raw);
    expect(entries).toHaveLength(2);
    expect(entries[0].result.domain).toBe('media');
    expect(entries[0].result.confidence).toBe(1);
  });

  it('drops unknown domains and malformed entries', () => {
    const raw = JSON.stringify({
      classifications: [
        { id: 'a', domain: 'spaceship', confidence: 0.9 },
        { domain: 'media', confidence: 0.9 },
        'garbage',
      ],
    });
    expect(parseLlmClassifications(raw)).toHaveLength(0);
  });

  it('returns empty on non-JSON', () => {
    expect(parseLlmClassifications('not json')).toHaveLength(0);
  });
});

describe('cachedDomain', () => {
  it('reads a valid cached classification', () => {
    const cached = cachedDomain({
      domain_classification: { domain: 'band', confidence: 0.9, reason: 'llm said band' },
    });
    expect(cached?.domain).toBe('band');
    expect(cached?.source).toBe('cached');
  });

  it('ignores missing or invalid caches', () => {
    expect(cachedDomain({})).toBeNull();
    expect(cachedDomain({ domain_classification: { domain: 'nope' } })).toBeNull();
  });
});

describe('autoDomainOverride', () => {
  const base: CharacterCardAuditResult = {
    characterId: 'c1',
    currentTitle: 'Some Phrase',
    status: 'needs_identity_resolution',
    reason: 'no human signal',
    recommendedAction: 'needs_review',
  };

  it('routes confident non-person domains with auto action at >= 0.85', () => {
    const override = autoDomainOverride(base, {
      domain: 'media',
      confidence: 0.9,
      source: 'llm',
      reason: 'anime',
    });
    expect(override?.status).toBe('wrong_domain_media');
    expect(override?.recommendedAction).toBe('move_to_interest');
  });

  it('keeps review action between 0.7 and 0.85', () => {
    const override = autoDomainOverride(base, {
      domain: 'event',
      confidence: 0.75,
      source: 'llm',
      reason: 'a show',
    });
    expect(override?.status).toBe('wrong_domain_event');
    expect(override?.recommendedAction).toBe('needs_review');
  });

  it('upgrades a weak wrong-domain call when the LLM confirms a person instead', () => {
    const weakBand: CharacterCardAuditResult = {
      ...base,
      status: 'wrong_domain_band',
    };
    const override = autoDomainOverride(weakBand, {
      domain: 'person',
      confidence: 0.9,
      source: 'llm',
      reason: 'is a named human artist',
    });
    expect(override?.status).toBe('valid_identity');
    expect(override?.recommendedAction).toBe('keep');
  });

  it('does nothing below confidence or on unknown', () => {
    expect(
      autoDomainOverride(base, { domain: 'tool', confidence: 0.5, source: 'llm', reason: 'x' }),
    ).toBeNull();
    expect(
      autoDomainOverride(base, { domain: 'unknown', confidence: 0.99, source: 'llm', reason: 'x' }),
    ).toBeNull();
  });
});
