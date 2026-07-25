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
});
