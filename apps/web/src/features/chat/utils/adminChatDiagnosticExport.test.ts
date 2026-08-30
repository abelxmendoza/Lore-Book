import { describe, expect, it } from 'vitest';

import type { Message } from '../message/ChatMessage';

import {
  buildChatConversationCopyText,
  buildComposerAndContextDebugSnapshot,
} from './adminChatDiagnosticExport';

function message(overrides: Partial<Message> = {}): Message {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    role: 'user',
    content: 'Marcus joined Vanguard Robotics.',
    timestamp: new Date('2026-07-25T12:00:00.000Z'),
    ...overrides,
  };
}

describe('buildChatConversationCopyText', () => {
  it('keeps the ordinary copy action as a simple transcript', () => {
    expect(buildChatConversationCopyText([message()])).toBe(
      'You: Marcus joined Vanguard Robotics.',
    );
  });

  it('includes composer chips, focus chip, and context used in the copy', () => {
    const snapshot = buildComposerAndContextDebugSnapshot({
      chatFocus: {
        entityId: 'char-1',
        entityName: 'Alex',
        entityType: 'character',
        sourceSurface: 'love',
        sourceLabel: 'Dating & Romance',
        relationshipId: 'rel-1',
        relationshipName: 'Alex',
        knowledgeScope: 'romantic relationship — feelings, patterns, and connection',
        sessionStats: {
          messagesSent: 0,
          connectionDelta: 0,
          affectionDelta: 0,
          lastUpdatedAt: '2026-07-25T12:00:00.000Z',
        },
      },
      composerDraft: 'How are things going with Alex?',
      composerEntityChips: [
        {
          id: 'char-1',
          name: 'Alex',
          type: 'character',
          status: 'confirmed',
          aliases: [],
          mentionKeys: ['alex'],
          matchedLabel: 'Alex',
        },
      ],
      includedSlots: ['character:char-1'],
      lexicalPreviewChips: [
        {
          text: 'Alex',
          type: 'PERSON',
          start: 26,
          end: 30,
          entityStatus: 'known',
          matchedEntityId: 'char-1',
          matchedEntityName: 'Alex',
          confidence: 0.91,
        },
      ],
      threadChips: [{ id: 'char-1', name: 'Alex', type: 'character' }],
      selectedThreadChipId: 'char-1',
      entityContext: { type: 'ROMANTIC_RELATIONSHIP', id: 'rel-1' },
      composerEntitiesFromFocus: [
        {
          id: 'char-1',
          name: 'Alex',
          type: 'character',
          status: 'confirmed',
          aliases: [],
          mentionKeys: ['alex'],
          matchedLabel: 'Alex',
        },
      ],
    });

    const text = buildChatConversationCopyText([message()], undefined, snapshot);

    expect(text).toContain('===== COMPOSER & CONTEXT DEBUG =====');
    expect(text).toContain('Focus chip: Alex · Dating & Romance (love/character)');
    expect(text).toContain('Composer draft: How are things going with Alex?');
    expect(text).toContain('- Alex (character; confirmed, included) [char-1]');
    expect(text).toContain('Lexical preview chips (1):');
    expect(text).toContain('"Alex" @26-30');
    expect(text).toContain('entityContext: ROMANTIC_RELATIONSHIP [rel-1]');
    expect(text).toContain('composerEntities from focus (1):');
  });

  it('describes event focus as a canonical enrichment target, not an excluded character', () => {
    const eventFocus = {
      entityId: 'event-1',
      entityName: 'Catch-up coffee after the gap',
      entityType: 'event' as const,
      sourceSurface: 'events' as const,
      sourceLabel: 'Life Log',
      sessionStats: {
        messagesSent: 0,
        connectionDelta: 0,
        affectionDelta: 0,
        lastUpdatedAt: '2026-07-25T12:00:00.000Z',
      },
    };
    const eventChip = {
      id: 'event-1',
      name: 'Catch-up coffee after the gap',
      type: 'event' as const,
      status: 'confirmed' as const,
      aliases: [],
      mentionKeys: ['catch-up coffee after the gap'],
      matchedLabel: 'Catch-up coffee after the gap',
    };
    const snapshot = buildComposerAndContextDebugSnapshot({
      chatFocus: eventFocus,
      composerEntitiesFromFocus: [eventChip],
    });

    const text = buildChatConversationCopyText([message()], undefined, snapshot);
    expect(text).toContain('Focus chip: Catch-up coffee after the gap · Life Log (events/event)');
    expect(text).toContain('canonical event: Catch-up coffee after the gap [event-1]');
    expect(text).toContain('exclude from creation; keep as enrichment target');
    expect(text).toContain('Catch-up coffee after the gap (event; confirmed)');
    expect(text).not.toContain('Catch-up coffee after the gap (character');
    expect(text).not.toContain('event; confirmed, excluded');
  });

  it('annotates message chips in the transcript', () => {
    const text = buildChatConversationCopyText([
      message({
        mentionedEntities: [
          {
            id: 'person-1',
            name: 'Marcus',
            type: 'character',
            confidence: 0.9,
            provenance: 'character_book',
          },
        ],
      }),
    ]);
    expect(text).toContain('[message chips: Marcus (character)]');
  });

  it('includes people, places, actors, building on, and recent mentions', () => {
    const text = buildChatConversationCopyText(
      [message()],
      undefined,
      undefined,
      {
        summaryLine: 'People: Marcus, Jamie. Places: Northwind Depot.',
        people: ['Marcus', 'Jamie'],
        places: ['Northwind Depot'],
        themes: ['work'],
        actors: [
          {
            name: 'Marcus',
            kind: 'character',
            role: 'main',
            status: 'active',
            mentions: 3,
            entityId: 'c-marcus',
            actorType: 'PERSON',
          },
        ],
        buildingOn: [{ id: 'c-marcus', name: 'Marcus', type: 'character' }],
        recentMentions: [{ id: 'm1', name: 'the organizers', lifecycleStatus: 'GROUP' }],
      },
    );

    expect(text).toContain('===== THREAD SURFACE DEBUG =====');
    expect(text).toContain('People (2): Marcus, Jamie');
    expect(text).toContain('Places (1): Northwind Depot');
    expect(text).toContain('Actors (1):');
    expect(text).toContain('- Marcus (character, PERSON, main, active, 3 mentions) [c-marcus]');
    expect(text).toContain('Building on (1):');
    expect(text).toContain('- Marcus (character) [c-marcus]');
    expect(text).toContain('Recent mentions (1):');
    expect(text).toContain('- the organizers (GROUP) [m1]');
  });

  it('adds records, persistence, pipeline, and agent intent to the admin receipt', () => {
    const input = message({
      mentionedEntities: [
        {
          id: 'person-1',
          name: 'Marcus',
          type: 'character',
          confidence: 0.94,
          provenance: 'character_book',
        },
      ],
      creationOutcomes: [
        {
          mention: 'Vanguard Robotics',
          action: 'create',
          entityId: 'org-1',
          entityName: 'Vanguard Robotics',
          authority: 'core',
        },
      ],
    });

    const text = buildChatConversationCopyText([input], {
      threadId: 'thread-1',
      generatedAt: '2026-07-25T12:05:00.000Z',
      byMessageId: {
        [input.id]: {
          durability: {
            userMessage: { persisted: true },
            ingestion: { status: 'COMPLETED', completedStages: ['entity_detection'] },
            pipelineRun: {
              status: 'COMPLETED',
              step_results: {
                entity_detection: {
                  result: {
                    production: {
                      peopleCreated: 1,
                      eventsCreated: 0,
                    },
                  },
                },
              },
            },
            confirmedArtifacts: {
              counts: {
                total: 2,
                persistedRecords: 1,
                reviewCandidates: 1,
              },
              artifacts: [
                {
                  kind: 'organization',
                  id: 'candidate-1',
                  label: 'Vanguard Robotics',
                  status: 'review_candidate',
                },
              ],
            },
          },
          trace: {
            enabled: true,
            messageId: input.id,
            pipeline: {
              messageId: input.id,
              phases: ['lexical', 'entity-resolution'],
            },
            runs: [],
            observations: [],
            proposedActions: [
              {
                agent_name: 'IdentityAgent',
                action_type: 'create_entity',
                routed_to: 'entity_authority',
                payload: { systemPrompt: 'must never appear' },
              },
            ],
          },
        },
      },
    });

    expect(text).toContain('LOREBOOK ADMIN DIAGNOSTIC RECEIPT');
    expect(text).toContain('[message chips: Marcus (character)]');
    expect(text).toContain('"peopleCreated": 1');
    expect(text).toContain('"eventsCreated": 0');
    expect(text).toContain('"persistedRecords": 1');
    expect(text).toContain('"status": "review_candidate"');
    expect(text).not.toContain('[truncated: depth limit]');
    expect(text).toContain('"Vanguard Robotics"');
    expect(text).toContain('"action": "create_entity"');
    expect(text).not.toContain('must never appear');
  });

  it('redacts sensitive keys inside pipeline and runtime output', () => {
    const input = message();
    const text = buildChatConversationCopyText([input], {
      byMessageId: {
        [input.id]: {
          durability: {
            pipelineRun: {
              step_results: {
                apiKey: 'sk-example',
                access_token: 'provider-token',
                error: 'Provider rejected Bearer abc.def.ghi and sk-example-secret',
                safeCount: 2,
              },
            },
          },
        },
      },
      runtimeEvents: [
        {
          phase: 'stream_complete',
          ts: Date.parse('2026-07-25T12:01:00.000Z'),
          meta: { cookie: 'session-cookie', sourceCount: 3 },
        },
      ],
    });

    expect(text).not.toContain('sk-example');
    expect(text).not.toContain('provider-token');
    expect(text).not.toContain('session-cookie');
    expect(text).not.toContain('abc.def.ghi');
    expect(text).not.toContain('sk-example-secret');
    expect(text).toContain('"safeCount": 2');
    expect(text).toContain('"sourceCount": 3');
  });

  it('includes the classified generation failure in the admin receipt', () => {
    const input = message({
      role: 'assistant',
      content: 'Reply failed',
      persistStatus: 'failed',
      lifecycle: {
        localPersistence: 'saved',
        cloudPersistence: 'saved',
        processing: 'failed',
        summary: 'not_requested',
        retryCount: 0,
        updatedAt: '2026-07-25T12:02:00.000Z',
        lastError: {
          stage: 'generation',
          code: 'openai_circuit_open',
          message: 'Saved, but reply failed',
          retryable: true,
          occurredAt: '2026-07-25T12:02:00.000Z',
        },
      },
      metadata: {
        generationFailure: {
          code: 'openai_circuit_open',
          stage: 'response_generation',
          errorCategory: 'quota',
          noticeCode: 'message_saved_assistant_failed',
        },
      },
    });

    const text = buildChatConversationCopyText([input], { threadId: 'thread-1' });

    expect(text).toContain('"generationFailure"');
    expect(text).toContain('"openai_circuit_open"');
    expect(text).toContain('"response_generation"');
    expect(text).toContain('"errorCategory": "quota"');
  });

  it('exports composition decisions and cognitive trace for admin review', () => {
    const input = message({
      role: 'assistant',
      metadata: {
        compositionPlan: {
          version: 'composition-plan-v1',
          profile: 'recall',
          selectedEvidenceIds: ['evidence-1'],
          discardedEvidenceIds: ['evidence-2'],
        },
        compositionQuality: { score: 1, passed: true },
      },
    });
    const text = buildChatConversationCopyText([input], {
      byMessageId: {
        [input.id]: {
          cognitiveTrace: {
            version: 'cognitive-observatory-v1',
            stages: [{ stage: 'RESPONSE_PLANNING', status: 'PASS' }],
          },
        },
      },
    });

    expect(text).toContain('"composition"');
    expect(text).toContain('"composition-plan-v1"');
    expect(text).toContain('"cognitiveTrace"');
    expect(text).toContain('"RESPONSE_PLANNING"');
  });
});
