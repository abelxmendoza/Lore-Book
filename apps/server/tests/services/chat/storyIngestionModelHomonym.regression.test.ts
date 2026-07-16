/**
 * Production-path regression fixture: model-name vs person homonym + chat durability truth.
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

export const MODEL_HOMONYM_FIXTURE =
  "so i've been working on Lorebook a lot lately and have been making it with the release of Claude Fable 5, Opus 4.8, Cursor Composer 2.5, Codex Chatgpt 5.5 and now with the release of 5.6 Nyx which just so happens to be the same name as one of my most recent lovers which is funny because the names of the models match my name Marcus and the girl i was fucking Nyx's name. Fable and Nyx which is hilarious and funny. I feel like Silas Grand is playing a joke on me.";

const chatIngressSchema = z.object({
  message: z.string().max(5000),
  clientIdempotencyKey: z.string().min(8).max(128).optional(),
});

describe('story ingestion regression — model homonym fixture', () => {
  it('accepts the fixture through chat ingress validation (sexual language is not a reject)', () => {
    const parsed = chatIngressSchema.safeParse({
      message: MODEL_HOMONYM_FIXTURE,
      clientIdempotencyKey: 'fixture-model-homonym-001',
    });
    expect(parsed.success).toBe(true);
    expect(MODEL_HOMONYM_FIXTURE).toMatch(/fucking/);
    expect(mentionsLoreBookProduct(MODEL_HOMONYM_FIXTURE)).toBe(true);
    expect(detectMetaQuery(MODEL_HOMONYM_FIXTURE)?.strength).toBe('soft');
  });

  it('post-persist assistant failure yields ChatDurabilityError with persisted=true (UI must not claim unsaved)', () => {
    const streamSetupErr = Object.assign(new Error('Rate limit 429'), { status: 429 });
    const classified = classifyIngestionError(streamSetupErr);
    const durability = buildDurabilityPayload({
      userMessageId: 'msg-nyx-1',
      sessionId: 'thread-1',
      idempotencyKey: 'fixture-model-homonym-001',
      assistantStatus: 'failed',
      assistantErrorCategory: classified.category,
      ingestionJobId: 'job-nyx-1',
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

  it('does not promote humorous Silas Grand speculation into belief facts', () => {
    expect(
      isSpeculativeHumorClaim('I feel like Silas Grand is playing a joke on me.'),
    ).toBe(true);
    const beliefs = inferBeliefs(MODEL_HOMONYM_FIXTURE);
    expect(beliefs.every((b) => !/silas grand/i.test(b.displayName))).toBe(true);
    const labels = labelClaimEpistemics(MODEL_HOMONYM_FIXTURE);
    const joke = labels.find((l) => /silas grand/i.test(l.text));
    expect(joke?.label).toBe('humorous_speculation');
  });

  it('classifies versioned model names as software and the fictional lover as person', () => {
    expect(classifyEntity('5.6 Nyx', MODEL_HOMONYM_FIXTURE).type).toBe('APP');
    expect(classifyEntity('Claude Fable 5', MODEL_HOMONYM_FIXTURE).type).toBe('APP');
    expect(classifyEntity('Opus 4.8', MODEL_HOMONYM_FIXTURE).type).toBe('APP');
    expect(classifyEntity('Cursor Composer 2.5', MODEL_HOMONYM_FIXTURE).type).toBe('APP');
    expect(classifyEntity('Nyx', MODEL_HOMONYM_FIXTURE).type).toBe('PERSON');
    expect(classifyEntity('Lorebook', MODEL_HOMONYM_FIXTURE).type).toBe('PRODUCT');
  });

  it('resolves Nyx model and Nyx person as distinct mention-level entities', () => {
    const modelCand = {
      id: 'ent-model-nyx',
      name: '5.6 Nyx',
      aliases: ['Nyx'],
      type: 'APP',
    };
    const personCand = {
      id: 'ent-person-nyx',
      name: 'Nyx',
      aliases: [],
      type: 'PERSON',
    };

    const spans = findSurfaceSpans(MODEL_HOMONYM_FIXTURE, 'Nyx');
    expect(spans.length).toBeGreaterThanOrEqual(2);

    const resolutions = resolveHomonymMentions('Nyx', MODEL_HOMONYM_FIXTURE, [
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
    expect(personHits.some((r) => r.selectedEntityId === 'ent-person-nyx')).toBe(true);
    expect(modelHits.some((r) => r.selectedEntityId === 'ent-model-nyx')).toBe(true);
    expect(
      personHits.every((r) => r.selectedEntityId !== 'ent-model-nyx'),
    ).toBe(true);

    // Diagnostics shape required by the brief
    for (const r of resolutions) {
      expect(r).toMatchObject({
        surface: 'Nyx',
        mentionSpan: expect.objectContaining({ start: expect.any(Number), end: expect.any(Number) }),
        sentence: expect.any(String),
        inferredType: expect.any(String),
        resolutionReason: expect.any(String),
        confidence: expect.any(Number),
      });
    }
  });

  it('does not collapse all homonym mentions via a single message-level resolve', () => {
    const modelCand = { id: 'ent-model-nyx', name: '5.6 Nyx', aliases: ['Nyx'], type: 'APP' };
    const personCand = { id: 'ent-person-nyx', name: 'Nyx', aliases: [], type: 'PERSON' };
    const asPerson = resolveMention('Nyx', [modelCand, personCand], {}, 'PERSON');
    const asApp = resolveMention('Nyx', [modelCand, personCand], {}, 'APP');
    expect(asPerson.resolvedId).toBe('ent-person-nyx');
    expect(asApp.resolvedId).toBe('ent-model-nyx');
    expect(asPerson.resolvedId).not.toBe(asApp.resolvedId);
  });

  it('attaches romantic evidence only to the person — not models, Lorebook, Fable, or Silas Grand', () => {
    const cases: Array<[string, string, boolean]> = [
      ['Nyx', 'person', true],
      ['5.6 Nyx', 'software_tool', false],
      ['Claude Fable 5', 'software_tool', false],
      ['Fable', 'person', false],
      ['Lorebook', 'project', false],
      ['Silas Grand', 'person', false],
      ['Cursor Composer 2.5', 'software_tool', false],
      ['Opus 4.8', 'ai_model', false],
    ];

    for (const [name, type, eligible] of cases) {
      const r = evaluateDatingEligibility({
        entityId: `id-${name}`,
        name,
        canonicalType: type,
        isKnownOrganization: false,
        evidenceSnippets: [MODEL_HOMONYM_FIXTURE],
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

    const solEvidence = assessRomanticEvidence([MODEL_HOMONYM_FIXTURE], 'Nyx');
    expect(solEvidence.strength).toBe('strong');

    const fableEvidence = assessRomanticEvidence([MODEL_HOMONYM_FIXTURE], 'Fable');
    expect(fableEvidence.strength).not.toBe('strong');

    const modelEvidence = assessRomanticEvidence([MODEL_HOMONYM_FIXTURE], '5.6 Nyx');
    expect(modelEvidence.strength).not.toBe('strong');
  });

  it('infers release-of span as model and fucking-span as person for the same surface', () => {
    const spans = findSurfaceSpans(MODEL_HOMONYM_FIXTURE, 'Nyx');
    const inferred = spans.map((span) => inferMentionType('Nyx', MODEL_HOMONYM_FIXTURE, span));
    expect(inferred.some((i) => i.type === 'person')).toBe(true);
    expect(inferred.some((i) => i.type === 'ai_model' || i.type === 'software_tool')).toBe(true);
  });

  it('builds an authorized failure-path diagnostic for the fixture', () => {
    const durability = buildDurabilityPayload({
      userMessageId: 'msg-nyx-1',
      sessionId: 'thread-1',
      assistantStatus: 'failed',
      ingestionJobId: 'job-nyx-1',
      ingestionStatus: 'QUEUED',
    });
    const homonyms = resolveHomonymMentions('Nyx', MODEL_HOMONYM_FIXTURE, [
      { id: 'ent-model-nyx', name: '5.6 Nyx', aliases: ['Nyx'], type: 'APP' },
      { id: 'ent-person-nyx', name: 'Nyx', type: 'PERSON' },
    ]);
    const relationshipEvidenceAssignments = [
      {
        entityId: 'ent-person-nyx',
        name: 'Nyx',
        attached: evidenceAttachesToEntity(
          MODEL_HOMONYM_FIXTURE,
          'Nyx',
          [],
          (w) => /\b(fucking|lovers?)\b/i.test(w),
        ),
      },
      {
        entityId: 'ent-model-nyx',
        name: '5.6 Nyx',
        attached: evidenceAttachesToEntity(
          MODEL_HOMONYM_FIXTURE,
          '5.6 Nyx',
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
      claimEpistemicLabels: labelClaimEpistemics(MODEL_HOMONYM_FIXTURE),
      frontendRecoveryDecision: durability.userMessage.persisted
        ? 'keep_sent_bubble_retry_response'
        : 'restore_composer_unsaved',
    };

    expect(trace.messagePersisted).toBe(true);
    expect(trace.frontendRecoveryDecision).toBe('keep_sent_bubble_retry_response');
    expect(trace.homonymResolutions.some((h) => h.inferredType === 'person')).toBe(true);
    expect(
      relationshipEvidenceAssignments.find((a) => a.entityId === 'ent-person-nyx')?.attached,
    ).toBe(true);
    expect(
      relationshipEvidenceAssignments.find((a) => a.entityId === 'ent-model-nyx')?.attached,
    ).toBe(false);
  });
});
