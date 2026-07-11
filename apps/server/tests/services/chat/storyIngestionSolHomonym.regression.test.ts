/**
 * Production-path regression fixture: Sol model vs Sol person + chat durability truth.
 *
 * Exact user message that previously surfaced:
 *   "I couldn’t save or process that story..."
 * even when later-stage failures (or durability propagation gaps) were the real issue.
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';

import {
  evaluateDatingEligibility,
  assessRomanticEvidence,
  evidenceAttachesToEntity,
} from '../../../src/services/conversationCentered/datingEligibilityService';
import { classifyEntity } from '../../../src/services/entities/entityClassifier';
import {
  resolveHomonymMentions,
  inferMentionType,
  findSurfaceSpans,
} from '../../../src/services/entities/mentionContextResolution';
import { resolveMention } from '../../../src/services/entities/entityResolutionCore';
import {
  buildDurabilityApiResponse,
  assertValidDurabilityResponse,
} from '../../../src/services/chat/durabilityApiContract';
import {
  buildDurabilityPayload,
  ChatDurabilityError,
  isChatDurabilityError,
} from '../../../src/services/chat/chatDurability';
import { classifyIngestionError } from '../../../src/services/ingestion/ingestionJobStates';
import { inferBeliefs, isSpeculativeHumorClaim } from '../../../src/services/concepts/inference/beliefInference';
import { labelClaimEpistemics } from '../../../src/services/memoryQuality/claimEpistemicLabeler';
import { mentionsLoreBookProduct } from '../../../src/services/chat/metaConversationClassifier';
import { detectMetaQuery } from '../../../src/services/chat/lorebookSelfModelService';

export const SOL_HOMONYM_FIXTURE =
  "so i've been working on Lorebook a lot lately and have been making it with the release of Claude Fable 5, Opus 4.8, Cursor Composer 2.5, Codex Chatgpt 5.5 and now with the release of 5.6 Sol which just so happens to be the same name as one of my most recent lovers which is funny because the names of the models match my name Abel and the girl i was fucking Sol's name. Fable and Sol which is hilarious and funny. I feel like Sam Altman is playing a joke on me.";

const chatIngressSchema = z.object({
  message: z.string().max(5000),
  clientIdempotencyKey: z.string().min(8).max(128).optional(),
});

describe('story ingestion regression — Sol homonym fixture', () => {
  it('accepts the fixture through chat ingress validation (sexual language is not a reject)', () => {
    const parsed = chatIngressSchema.safeParse({
      message: SOL_HOMONYM_FIXTURE,
      clientIdempotencyKey: 'fixture-sol-homonym-001',
    });
    expect(parsed.success).toBe(true);
    expect(SOL_HOMONYM_FIXTURE).toMatch(/fucking/);
    expect(mentionsLoreBookProduct(SOL_HOMONYM_FIXTURE)).toBe(true);
    expect(detectMetaQuery(SOL_HOMONYM_FIXTURE)?.strength).toBe('soft');
  });

  it('post-persist assistant failure yields ChatDurabilityError with persisted=true (UI must not claim unsaved)', () => {
    const streamSetupErr = Object.assign(new Error('Rate limit 429'), { status: 429 });
    const classified = classifyIngestionError(streamSetupErr);
    const durability = buildDurabilityPayload({
      userMessageId: 'msg-sol-1',
      sessionId: 'thread-1',
      idempotencyKey: 'fixture-sol-homonym-001',
      assistantStatus: 'failed',
      assistantErrorCategory: classified.category,
      ingestionJobId: 'job-sol-1',
      ingestionStatus: 'QUEUED',
    });
    const err = new ChatDurabilityError({
      message: streamSetupErr.message,
      category: classified.category,
      code: classified.code,
      stage: 'response_generation',
      durability,
      cause: streamSetupErr,
    });
    expect(isChatDurabilityError(err)).toBe(true);
    expect(err.durability.userMessage.persisted).toBe(true);
    const body = buildDurabilityApiResponse(err.durability, {
      assistantFailed: true,
      code: err.code,
      stage: err.stage,
    });
    expect(assertValidDurabilityResponse(body)).toBe(true);
    expect(body.notice.code).toMatch(/^message_saved/);
    expect(body.memory?.user_message_saved).toBe(true);
  });

  it('does not promote humorous Sam Altman speculation into belief facts', () => {
    expect(
      isSpeculativeHumorClaim('I feel like Sam Altman is playing a joke on me.'),
    ).toBe(true);
    const beliefs = inferBeliefs(SOL_HOMONYM_FIXTURE);
    expect(beliefs.every((b) => !/sam altman/i.test(b.displayName))).toBe(true);
    const labels = labelClaimEpistemics(SOL_HOMONYM_FIXTURE);
    const joke = labels.find((l) => /sam altman/i.test(l.text));
    expect(joke?.label).toBe('humorous_speculation');
  });

  it('classifies versioned model names as software and Sol-the-lover as person', () => {
    expect(classifyEntity('5.6 Sol', SOL_HOMONYM_FIXTURE).type).toBe('APP');
    expect(classifyEntity('Claude Fable 5', SOL_HOMONYM_FIXTURE).type).toBe('APP');
    expect(classifyEntity('Opus 4.8', SOL_HOMONYM_FIXTURE).type).toBe('APP');
    expect(classifyEntity('Cursor Composer 2.5', SOL_HOMONYM_FIXTURE).type).toBe('APP');
    expect(classifyEntity('Sol', SOL_HOMONYM_FIXTURE).type).toBe('PERSON');
    expect(classifyEntity('Lorebook', SOL_HOMONYM_FIXTURE).type).toBe('PRODUCT');
  });

  it('resolves Sol model and Sol person as distinct mention-level entities', () => {
    const modelCand = {
      id: 'ent-model-sol',
      name: '5.6 Sol',
      aliases: ['Sol'],
      type: 'APP',
    };
    const personCand = {
      id: 'ent-person-sol',
      name: 'Sol',
      aliases: [],
      type: 'PERSON',
    };

    const spans = findSurfaceSpans(SOL_HOMONYM_FIXTURE, 'Sol');
    expect(spans.length).toBeGreaterThanOrEqual(2);

    const resolutions = resolveHomonymMentions('Sol', SOL_HOMONYM_FIXTURE, [
      modelCand,
      personCand,
    ]);
    expect(resolutions.length).toBe(spans.length);

    const types = new Set(resolutions.map((r) => r.inferredType));
    expect(types.has('person')).toBe(true);
    expect(
      [...types].some((t) => t === 'ai_model' || t === 'software_tool'),
    ).toBe(true);

    const personHits = resolutions.filter((r) => r.inferredType === 'person');
    const modelHits = resolutions.filter(
      (r) => r.inferredType === 'ai_model' || r.inferredType === 'software_tool',
    );
    expect(personHits.some((r) => r.selectedEntityId === 'ent-person-sol')).toBe(true);
    expect(modelHits.some((r) => r.selectedEntityId === 'ent-model-sol')).toBe(true);
    expect(
      personHits.every((r) => r.selectedEntityId !== 'ent-model-sol'),
    ).toBe(true);

    // Diagnostics shape required by the brief
    for (const r of resolutions) {
      expect(r).toMatchObject({
        surface: 'Sol',
        mentionSpan: expect.objectContaining({ start: expect.any(Number), end: expect.any(Number) }),
        sentence: expect.any(String),
        inferredType: expect.any(String),
        resolutionReason: expect.any(String),
        confidence: expect.any(Number),
      });
    }
  });

  it('does not collapse all Sol mentions via a single message-level resolve', () => {
    const modelCand = { id: 'ent-model-sol', name: '5.6 Sol', aliases: ['Sol'], type: 'APP' };
    const personCand = { id: 'ent-person-sol', name: 'Sol', aliases: [], type: 'PERSON' };
    const asPerson = resolveMention('Sol', [modelCand, personCand], {}, 'PERSON');
    const asApp = resolveMention('Sol', [modelCand, personCand], {}, 'APP');
    expect(asPerson.resolvedId).toBe('ent-person-sol');
    expect(asApp.resolvedId).toBe('ent-model-sol');
    expect(asPerson.resolvedId).not.toBe(asApp.resolvedId);
  });

  it('attaches romantic evidence only to Sol the person — not models, Lorebook, Fable, or Sam Altman', () => {
    const cases: Array<[string, string, boolean]> = [
      ['Sol', 'person', true],
      ['5.6 Sol', 'software_tool', false],
      ['Claude Fable 5', 'software_tool', false],
      ['Fable', 'person', false],
      ['Lorebook', 'project', false],
      ['Sam Altman', 'person', false],
      ['Cursor Composer 2.5', 'software_tool', false],
      ['Opus 4.8', 'ai_model', false],
    ];

    for (const [name, type, eligible] of cases) {
      const r = evaluateDatingEligibility({
        entityId: `id-${name}`,
        name,
        canonicalType: type,
        isKnownOrganization: false,
        evidenceSnippets: [SOL_HOMONYM_FIXTURE],
      });
      expect(r.isEligible, `${name}/${type}`).toBe(eligible);
      if (!eligible) {
        expect(
          r.eligibilityReason === 'ineligible_non_person' ||
            r.eligibilityReason === 'ineligible_no_romantic_evidence' ||
            r.eligibilityReason === 'ineligible_evidence_belongs_to_other_entity',
          `${name} reason=${r.eligibilityReason}`,
        ).toBe(true);
      }
    }

    const solEvidence = assessRomanticEvidence([SOL_HOMONYM_FIXTURE], 'Sol');
    expect(solEvidence.strength).toBe('strong');

    const fableEvidence = assessRomanticEvidence([SOL_HOMONYM_FIXTURE], 'Fable');
    expect(fableEvidence.strength).not.toBe('strong');

    const modelEvidence = assessRomanticEvidence([SOL_HOMONYM_FIXTURE], '5.6 Sol');
    expect(modelEvidence.strength).not.toBe('strong');
  });

  it('infers release-of span as model and fucking-span as person for the same surface', () => {
    const spans = findSurfaceSpans(SOL_HOMONYM_FIXTURE, 'Sol');
    const inferred = spans.map((span) => inferMentionType('Sol', SOL_HOMONYM_FIXTURE, span));
    expect(inferred.some((i) => i.type === 'person')).toBe(true);
    expect(inferred.some((i) => i.type === 'ai_model' || i.type === 'software_tool')).toBe(true);
  });

  it('builds an authorized failure-path diagnostic for the fixture', () => {
    const durability = buildDurabilityPayload({
      userMessageId: 'msg-sol-1',
      sessionId: 'thread-1',
      assistantStatus: 'failed',
      ingestionJobId: 'job-sol-1',
      ingestionStatus: 'QUEUED',
    });
    const homonyms = resolveHomonymMentions('Sol', SOL_HOMONYM_FIXTURE, [
      { id: 'ent-model-sol', name: '5.6 Sol', aliases: ['Sol'], type: 'APP' },
      { id: 'ent-person-sol', name: 'Sol', type: 'PERSON' },
    ]);
    const relationshipEvidenceAssignments = [
      {
        entityId: 'ent-person-sol',
        name: 'Sol',
        attached: evidenceAttachesToEntity(
          SOL_HOMONYM_FIXTURE,
          'Sol',
          [],
          (w) => /\b(fucking|lovers?)\b/i.test(w),
        ),
      },
      {
        entityId: 'ent-model-sol',
        name: '5.6 Sol',
        attached: evidenceAttachesToEntity(
          SOL_HOMONYM_FIXTURE,
          '5.6 Sol',
          [],
          (w) => /\b(fucking|lovers?)\b/i.test(w),
        ),
      },
    ];

    const trace = {
      messagePersisted: durability.userMessage.persisted,
      ingestionJobStatus: durability.ingestion.status,
      failedStage: 'response_generation',
      errorCategory: 'rate_limit',
      entityMentions: homonyms.map((h) => ({
        surface: h.surface,
        inferredType: h.inferredType,
        selectedEntityId: h.selectedEntityId,
      })),
      homonymResolutions: homonyms,
      relationshipEvidenceAssignments,
      claimEpistemicLabels: labelClaimEpistemics(SOL_HOMONYM_FIXTURE),
      frontendRecoveryDecision: durability.userMessage.persisted
        ? 'keep_sent_bubble_retry_response'
        : 'restore_composer_unsaved',
    };

    expect(trace.messagePersisted).toBe(true);
    expect(trace.frontendRecoveryDecision).toBe('keep_sent_bubble_retry_response');
    expect(trace.homonymResolutions.some((h) => h.inferredType === 'person')).toBe(true);
    expect(
      relationshipEvidenceAssignments.find((a) => a.entityId === 'ent-person-sol')?.attached,
    ).toBe(true);
    expect(
      relationshipEvidenceAssignments.find((a) => a.entityId === 'ent-model-sol')?.attached,
    ).toBe(false);
  });
});
