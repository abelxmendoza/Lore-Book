import { describe, expect, it } from 'vitest';
import {
  classifyQuestionIntent,
  extractPersonNameFromIntent,
  extractSceneQuery,
} from '../../src/services/chat/questionIntentClassifier';
import { formatSceneForChat, type SceneReconstruction } from '../../src/services/story/sceneReconstructionService';
import {
  formatEventReconstructionForChat,
  type EventReconstruction,
} from '../../src/services/story/eventReconstructionService';
import {
  formatRelationshipStoryForChat,
  type RelationshipStory,
} from '../../src/services/story/relationshipStoryBuilder';
import {
  formatCharacterMemoryProfileForChat,
  type CharacterMemoryProfile,
} from '../../src/services/characters/characterMemoryProfileService';
import {
  formatConflictWarning,
  type EntityConflict,
} from '../../src/services/story/entityConflictResolver';
import { containsBlockedPhrase } from '../../src/services/chat/antiRepetitionLayer';

/** Transcript prompts from Sprint AM-9 — must route to story handlers, not generic fallbacks. */
const TRANSCRIPT_CASES = [
  { label: 'Jerry', message: 'Who is Jerry?', intent: 'person_profile', name: 'Jerry' },
  { label: 'James', message: 'Do you remember James?', intent: 'recall_person', name: 'James' },
  { label: 'Tía Grace', message: 'What happened at Tía Grace\'s house?', intent: 'scene_recall', scene: "Tía Grace's house" },
  { label: 'Tío Juan', message: 'What do you know about Tío Juan?', intent: 'person_profile', name: 'Tío Juan' },
  { label: 'Ashley', message: 'What happened with Ashley?', intent: 'event_story', name: 'Ashley' },
  { label: 'Sol', message: 'What happened with Sol?', intent: 'event_story', name: 'Sol' },
  { label: 'Club Metro', message: 'What happened at Club Metro?', intent: 'scene_recall', scene: 'Club Metro' },
  { label: 'Costco + Abuela', message: 'What happened at Costco with Abuela?', intent: 'scene_recall' },
  { label: 'Kelly onboarding', message: 'What happened with Kelly?', intent: 'event_story', name: 'Kelly' },
  { label: 'Amazon hiring', message: 'Tell me the story of Amazon hiring process', intent: 'event_story' },
  { label: 'Story roster', message: 'Who are the people in my story?', intent: 'story_roster' },
  { label: 'Card verification', message: 'Did you create the card?', intent: 'character_creation_check' },
] as const;

const FORBIDDEN_FALLBACKS = [
  "I don't have a clear record",
  'Tell me now and it goes into your lore',
  'My record there is thin',
  "I've captured that",
];

function assertStoryResponse(content: string, mustInclude: string[]) {
  for (const phrase of FORBIDDEN_FALLBACKS) {
    expect(content.toLowerCase()).not.toContain(phrase.toLowerCase());
  }
  for (const token of mustInclude) {
    expect(content).toMatch(new RegExp(token, 'i'));
  }
}

describe('Sprint AM — story intelligence & memory utilization', () => {
  describe('AM intent routing (transcript cases)', () => {
    for (const tc of TRANSCRIPT_CASES) {
      it(`routes "${tc.label}" — ${tc.message}`, () => {
        expect(classifyQuestionIntent(tc.message)).toBe(tc.intent);
        if ('name' in tc && tc.name) {
          expect(extractPersonNameFromIntent(tc.message, tc.intent)).toBe(tc.name);
        }
        if ('scene' in tc && tc.scene) {
          expect(extractSceneQuery(tc.message)).toBe(tc.scene);
        }
      });
    }
  });

  describe('AM-1 scene reconstruction format', () => {
    it('formats Tía Grace Memorial Day scene with participants and meaning', () => {
      const scene: SceneReconstruction = {
        summary: 'Memorial Day weekend visit at Tía Grace\'s house',
        participants: ['Abel', 'Jerry', 'James', 'Tía Grace'],
        location: "Tía Grace's house",
        activities: [
          'building LoreBook',
          'smoking',
          'James playing Magic',
          'Jerry discussing hardware',
          'doubting coding project',
        ],
        emotional_context: 'Family gathering during early LoreBook development',
        significance: 'Family gathering during early LoreBook development.',
        evidence: { memories: 4, events: 1, thread_messages: 3, facts: 2 },
      };
      const text = formatSceneForChat(scene);
      assertStoryResponse(text, ['Participants', 'Jerry', 'James', 'Tía Grace', 'Meaning', 'Evidence']);
    });

    it('formats Club Metro scene', () => {
      const scene: SceneReconstruction = {
        summary: 'Night out at Club Metro in DTLA',
        participants: ['Abel', 'Ashley'],
        location: 'Club Metro',
        activities: ['dancing', 'meeting after the club'],
        emotional_context: null,
        significance: 'Where Ashley entered the story.',
        evidence: { memories: 2, events: 1, thread_messages: 1, facts: 0 },
      };
      const text = formatSceneForChat(scene);
      assertStoryResponse(text, ['Club Metro', 'Ashley', 'Meaning']);
    });
  });

  describe('AM-2 character memory profiles', () => {
    it('formats Tío Juan as lived biography not generic uncle line', () => {
      const profile: CharacterMemoryProfile = {
        whoAreThey:
          'Lives with you. Abuela\'s son. Makes sure you eat. Frequent participant in household life.',
        relationshipToUser: 'uncle',
        majorMemories: ['Medical appointments', 'Household meals', 'Family responsibility'],
        recurringPatterns: ['Family responsibility', 'Caretaking'],
        firstSeen: '2024-01-15',
        lastSeen: '2025-06-01',
        importanceScore: 72,
        biography:
          'Tío Juan is woven into daily household life — not just "your uncle" but someone who shows up for meals and medical appointments.',
      };
      const text = formatCharacterMemoryProfileForChat(profile, 'Tío Juan');
      assertStoryResponse(text, ['Lives with you', 'Major memories', 'Biography', 'Medical']);
      expect(text).not.toMatch(/^He is your uncle\.?$/i);
    });

    it('formats Jerry with project context', () => {
      const profile: CharacterMemoryProfile = {
        whoAreThey: 'Friend and LoreBook collaborator. Discusses hardware and coding.',
        relationshipToUser: 'friend',
        majorMemories: ['Memorial Day at Tía Grace\'s', 'LoreBook development sessions'],
        recurringPatterns: ['Building LoreBook', 'Technical discussions'],
        firstSeen: '2024-05-25',
        lastSeen: '2025-06-10',
        importanceScore: 65,
        biography: 'Jerry appears in early LoreBook development scenes alongside James and family.',
      };
      const text = formatCharacterMemoryProfileForChat(profile, 'Jerry');
      assertStoryResponse(text, ['Jerry', 'LoreBook', 'Major memories']);
    });
  });

  describe('AM-4 duplicate character intelligence', () => {
    it('surfaces Juan identity conflict without merging', () => {
      const conflicts: EntityConflict[] = [
        {
          sharedToken: 'juan',
          reason: 'Shared first name "juan" across 2 character(s)',
          characters: [
            {
              id: '1',
              name: 'Tío Juan',
              category: 'Family',
              memoryCount: 8,
              relationshipHint: 'uncle',
            },
            {
              id: '2',
              name: 'Juan (Oscuri.dad)',
              category: 'Scene / Community',
              memoryCount: 3,
              relationshipHint: null,
            },
          ],
          recommendation:
            'Potential identity conflict — Family vs Scene / Community. Do NOT merge automatically.',
        },
      ];
      const text = formatConflictWarning(conflicts)!;
      assertStoryResponse(text, ['identity conflict', 'Tío Juan', 'Oscuri', 'Do NOT merge']);
    });
  });

  describe('AM-5 event reconstruction', () => {
    it('formats Ashley story with facts, timeline, and meaning', () => {
      const event: EventReconstruction = {
        title: 'Ashley — after Club Metro',
        facts: [
          'Met after Club Metro in DTLA',
          'Spent the night together',
          'One night stand',
        ],
        people: ['Ashley'],
        timeline: [{ date: '2024-08-12', label: 'Met at Club Metro' }],
        meaning: 'Positive experience but intentionally short-lived.',
        currentRelevance: 'Closed chapter — no ongoing relationship.',
        evidence: { events: 1, memories: 3, meaning_cached: true },
      };
      const text = formatEventReconstructionForChat(event);
      assertStoryResponse(text, ['Facts', 'Ashley', 'Club Metro', 'Meaning', 'Timeline']);
    });

    it('formats Costco + Abuela outing', () => {
      const event: EventReconstruction = {
        title: 'Costco with Abuela',
        facts: ['2.5 hours at Costco', 'Abuela is still alive — the highlight'],
        people: ['Abuela'],
        timeline: [{ date: '2025-06-14', label: 'Costco trip' }],
        meaning: 'The highlight was that my Abuela is still alive.',
        currentRelevance: 'Family continuity and gratitude.',
        evidence: { events: 1, memories: 2, meaning_cached: true },
      };
      const text = formatEventReconstructionForChat(event);
      assertStoryResponse(text, ['Costco', 'Abuela', 'still alive']);
    });
  });

  describe('AM-6 relationship story summaries', () => {
    it('formats Ashley relationship narrative for Love & Relationships', () => {
      const story: RelationshipStory = {
        personName: 'Ashley',
        relationshipType: 'hookup',
        status: 'ended',
        facts: [
          'Met after Club Metro in DTLA',
          'Spent the night together',
          'One night stand — no desire to continue relationship',
        ],
        meaning: 'Positive experience but intentionally short-lived.',
        scores: { affection: 0.6, health: 0.4, compatibility: 0.3 },
        flags: { green: ['Good chemistry'], red: ['No follow-up desired'] },
      };
      const text = formatRelationshipStoryForChat(story);
      assertStoryResponse(text, ['Ashley', 'Club Metro', 'Meaning', 'short-lived']);
    });
  });

  describe('AM-9 anti-fallback guardrails', () => {
    it('story formatters never emit therapist/fallback phrases', () => {
      const samples = [
        formatSceneForChat({
          summary: 'Test',
          participants: ['Jerry'],
          location: null,
          activities: [],
          emotional_context: null,
          significance: 'Meaning here.',
          evidence: { memories: 1, events: 0, thread_messages: 0, facts: 0 },
        }),
        formatEventReconstructionForChat({
          title: 'Kelly onboarding',
          facts: ['Kelly joined the team'],
          people: ['Kelly'],
          timeline: [],
          meaning: 'Professional milestone.',
          currentRelevance: null,
          evidence: { events: 1, memories: 0, meaning_cached: false },
        }),
      ];
      for (const s of samples) {
        for (const bad of FORBIDDEN_FALLBACKS) {
          expect(s).not.toContain(bad);
        }
        expect(containsBlockedPhrase(s)).toBe(false);
      }
    });
  });
});
