import { describe, it, expect } from 'vitest';

import { buildEvidenceBundle } from '../../../src/services/provenance/inference/evidenceBundleBuilder';
import { inferenceConfidenceLowerThanExplicit } from '../../../src/services/provenance/inference/provenanceConfidenceScorer';
import {
  hasProvenance,
  provenanceInferenceService,
  shouldCreateProvenanceCard,
} from '../../../src/services/provenance/inference/provenanceInferenceService';
import {
  canBecomeConfirmed,
  rejectReason,
  requiresSensitiveReview,
} from '../../../src/services/provenance/inference/provenanceIntegrityGuard';

function infer(
  text: string,
  extra: Parameters<typeof provenanceInferenceService.inferFromMessage>[0] = {},
) {
  return provenanceInferenceService.inferFromMessage({
    text,
    sourceMessageId: 'msg-1',
    sourceThreadId: 'thread-1',
    authorRole: 'user',
    ...extra,
  });
}

function findBundle(result: ReturnType<typeof infer>, claimPart: string) {
  return result.accepted.find((b) =>
    b.claimText.toLowerCase().includes(claimPart.toLowerCase()),
  );
}

describe('provenance inference rules', () => {
  it('explicit user statement creates evidence bundle', () => {
    const result = infer('Bryan Oconner is my best friend.');
    const bundle = findBundle(result, 'best friend');
    expect(bundle).toBeDefined();
    expect(bundle!.sourceType).toBe('user_message');
    expect(bundle!.origin).toBe('explicit_user_statement');
    expect(bundle!.sourceQuote).toContain('Bryan Oconner');
    expect(bundle!.sourceMessageId).toBe('msg-1');
    expect(bundle!.sourceThreadId).toBe('thread-1');
  });

  it('inferred schoolmate has lower confidence than explicit best friend', () => {
    const explicit = infer('Bryan Oconner is my best friend.');
    const inferred = infer('We went to Northwind Middle School with Bryan.');
    const explicitBundle = findBundle(explicit, 'best friend');
    const inferredBundle = findBundle(inferred, 'schoolmate');
    expect(explicitBundle).toBeDefined();
    expect(inferredBundle).toBeDefined();
    expect(
      inferenceConfidenceLowerThanExplicit(
        inferredBundle!.confidence,
        explicitBundle!.confidence,
      ),
    ).toBe(true);
    expect(inferredBundle!.origin).toBe('system_inferred');
    expect(inferredBundle!.sourceQuote).toMatch(/Northwind Middle School/i);
  });

  it('assistant-generated claim cannot become confirmed truth', () => {
    const result = infer('Bryan was important to you.', { authorRole: 'assistant' });
    const bundle = findBundle(result, 'important');
    expect(bundle).toBeDefined();
    expect(bundle!.origin).toBe('assistant_generated');
    expect(bundle!.truthState).not.toBe('confirmed');
    expect(canBecomeConfirmed(bundle!)).toBe(false);
  });

  it('user correction supersedes old claim', () => {
    const prior = infer('Bryan Oconner is my best friend.');
    const corrected = infer("Actually his name is Bryan O'Connor.", {
      priorBundles: prior.bundleHistory,
      sourceMessageId: 'msg-2',
    });
    expect(corrected.corrections.length).toBeGreaterThan(0);
    expect(corrected.corrections[0].newClaimText).toMatch(/Bryan O'Connor/i);
    const archived = corrected.bundleHistory.find((b) => b.truthState === 'archived');
    expect(archived).toBeDefined();
    const newIdentity = findBundle(corrected, "Bryan O'Connor");
    expect(newIdentity?.origin).toBe('user_corrected');
  });

  it('contradiction stores both old and new evidence', () => {
    const first = infer('Jamie is my best friend.');
    const second = infer('Jamie is not my best friend anymore.', {
      priorBundles: first.bundleHistory,
      sourceMessageId: 'msg-2',
    });
    expect(second.contradictions.length).toBeGreaterThan(0);
    const oldSide = second.bundleHistory.find((b) => b.truthState === 'contradicted');
    const newSide = second.accepted.find((b) => b.truthState === 'review');
    expect(oldSide).toBeDefined();
    expect(newSide).toBeDefined();
    expect(second.contradictions[0].oldClaimText).not.toBe(second.contradictions[0].newClaimText);
  });

  it('manual edit has highest authority', () => {
    const result = infer('', {
      sourceType: 'manual_edit',
      manualEdit: {
        claimText: 'Marcus is my best friend',
        claimType: 'relationship',
        confirmed: true,
      },
    });
    const bundle = findBundle(result, 'Marcus');
    expect(bundle).toBeDefined();
    expect(bundle!.sourceType).toBe('manual_edit');
    expect(bundle!.origin).toBe('user_confirmed');
    expect(bundle!.truthState).toBe('confirmed');
    expect(bundle!.confidence).toBeGreaterThan(0.94);
  });

  it('missing quote rejects durable candidate', () => {
    const bundle = buildEvidenceBundle({
      claimText: 'orphan claim',
      claimType: 'entity',
      sourceQuote: '',
      origin: 'explicit_user_statement',
      sourceType: 'user_message',
      sourceMessageId: 'msg-1',
      confidence: 0.9,
    });
    expect(rejectReason(bundle)).toBe('missing_source_quote');
  });

  it('sensitive claim requires review', () => {
    const result = infer('My boyfriend Jamie is my best friend.');
    const bundle = findBundle(result, 'Jamie');
    expect(bundle).toBeDefined();
    expect(requiresSensitiveReview(bundle!.claimText, bundle!.sourceQuote)).toBe(true);
    expect(bundle!.truthState).toBe('review');
  });

  it('provenance stores message thread and source', () => {
    const result = infer('I worked at Meridian Robotics on navigation.', {
      sourceMessageId: 'chat-42',
      sourceThreadId: 'thread-9',
    });
    const bundle = findBundle(result, 'Meridian');
    expect(bundle).toBeDefined();
    expect(bundle!.sourceMessageId).toBe('chat-42');
    expect(bundle!.sourceThreadId).toBe('thread-9');
    expect(bundle!.sourceType).toBe('user_message');
  });

  it('truthState changes preserve history', () => {
    const first = infer('Taylor is my best friend.');
    expect(first.bundleHistory.length).toBeGreaterThan(0);
    const second = infer("Actually Taylor's name is Taylor Brooks.", {
      priorBundles: first.bundleHistory,
      sourceMessageId: 'msg-2',
    });
    expect(second.bundleHistory.length).toBeGreaterThan(first.bundleHistory.length);
    const archivedCount = second.bundleHistory.filter((b) => b.truthState === 'archived').length;
    expect(archivedCount).toBeGreaterThan(0);
    expect(hasProvenance(second.accepted[0]!)).toBe(true);
    expect(shouldCreateProvenanceCard(second.accepted[0]!)).toBe(false);
  });
});
