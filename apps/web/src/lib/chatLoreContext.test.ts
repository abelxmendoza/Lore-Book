import { describe, it, expect, beforeEach } from 'vitest';

import {
  buildLoreBrief,
  collectPriorMentionedNames,
  compileChatLoreContext,
  detectChatLoreIntent,
  deriveChatThreadSubtitle,
} from './chatLoreContext';
import { mockDataService } from '../services/mockDataService';
import type { CertifiedEntity } from '../types/certifiedEntity';

const DEMO_FALLBACK = [
  { pattern: /\balex\b/i, id: 'demo-char-alex', name: 'Alex', type: 'character' as const },
  { pattern: /\bmarcus\b/i, id: 'demo-char-marcus', name: 'Marcus', type: 'character' as const },
  { pattern: /\bsan diego\b/i, id: 'demo-loc-sd', name: 'San Diego', type: 'location' as const },
  {
    pattern: /\bvanguard robotics\b/i,
    id: 'demo-org-vanguard',
    name: 'Vanguard Robotics',
    type: 'organization' as const,
  },
];

function seedDemoBooks() {
  mockDataService.register.characters([
    { id: 'c-alex', name: 'Alex', alias: [] } as never,
    { id: 'c-marcus', name: 'Marcus', alias: [] } as never,
  ]);
  mockDataService.register.locations([
    { id: 'l-mission', name: 'Mission Beach' } as never,
    { id: 'l-sd', name: 'San Diego' } as never,
  ]);
  mockDataService.register.skills([
    { id: 's-muay', skill_name: 'Muay Thai' } as never,
    { id: 's-ros', skill_name: 'ROS2' } as never,
  ]);
}

describe('chatLoreContext — pre-LLM lore compilation', () => {
  beforeEach(() => {
    seedDemoBooks();
  });

  describe('certified index matching (known lore)', () => {
    it('resolves confirmed entities from the demo book without LLM', () => {
      const ctx = compileChatLoreContext(
        'Alex and I had a good weekend at Mission Beach in San Diego',
        { fallbackEntities: DEMO_FALLBACK },
      );

      expect(ctx.confirmed.some((e) => e.name === 'Alex' && e.status === 'confirmed')).toBe(true);
      expect(ctx.confirmed.some((e) => e.name === 'Mission Beach')).toBe(true);
      expect(ctx.confirmed.some((e) => e.name === 'San Diego')).toBe(true);
      expect(ctx.stats.confirmedCount).toBeGreaterThanOrEqual(3);
    });

    it('treats indexed skills as confirmed, not drafts', () => {
      const ctx = compileChatLoreContext(
        'Muay Thai is still my main thing and I am improving at ROS2',
        { fallbackEntities: DEMO_FALLBACK },
      );

      const muay = ctx.entities.find((e) => e.name === 'Muay Thai');
      const ros = ctx.entities.find((e) => e.name === 'ROS2');
      expect(muay?.status).toBe('confirmed');
      expect(ros?.status).toBe('confirmed');
      expect(ctx.drafts.some((d) => d.name === 'Muay Thai')).toBe(false);
    });
  });

  describe('lexical + ontology discovery (new lore)', () => {
    it('detects titled kinship, employment org, and skill cues as drafts', () => {
      mockDataService.register.characters([]);
      const ctx = compileChatLoreContext(
        'My aunt Maribel started working at Summit Staffing while learning muay thai',
        { fallbackEntities: DEMO_FALLBACK },
      );

      expect(ctx.drafts.some((e) => e.name === 'Maribel' && e.type === 'character')).toBe(true);
      expect(ctx.entities.some((e) => e.type === 'organization' && /Summit/i.test(e.name))).toBe(true);
      expect(ctx.entities.some((e) => e.type === 'skill' && /Muay Thai/i.test(e.name))).toBe(true);
      expect(ctx.ontologyHits.length).toBeGreaterThan(0);
    });

    it('detects possessive dwelling locations from ontology', () => {
      const ctx = compileChatLoreContext("We stayed at Abuela's house for the weekend");

      expect(ctx.entities.some((e) => e.type === 'location' && /Abuela's House/i.test(e.name))).toBe(true);
    });

    it('surfaces relationship hints from glossary verbs', () => {
      const ctx = compileChatLoreContext('She is my girlfriend and we dated last night');

      expect(ctx.relationshipHints.some((h) => h.includes('ROMANTIC'))).toBe(true);
    });
  });

  describe('multi-turn thread memory', () => {
    it('carries prior mentioned names from conversation history', () => {
      const history = [
        {
          role: 'user' as const,
          content: 'Marcus mentioned Vanguard Robotics might have a deployment tech opening',
        },
        {
          role: 'assistant' as const,
          content: 'Worth tracking — Vanguard Robotics aligns with your field-deployment thread.',
        },
      ];

      const ctx = compileChatLoreContext('What did he say about the role again?', {
        conversationHistory: history,
        fallbackEntities: DEMO_FALLBACK,
      });

      expect(ctx.priorMentionedNames).toContain('Marcus');
      expect(ctx.priorMentionedNames.some((n) => /Vanguard/i.test(n))).toBe(true);
      expect(ctx.loreBrief).toContain('PRIOR_THREAD');
    });

    it('builds thread dominant entities from recent window', () => {
      const history = [
        { role: 'user' as const, content: 'Alex and I went to Mission Beach' },
        { role: 'assistant' as const, content: 'Sounds like a meaningful reset with Alex.' },
      ];

      const ctx = compileChatLoreContext('We should go back there soon', {
        conversationHistory: history,
        fallbackEntities: DEMO_FALLBACK,
      });

      expect(ctx.threadDominantEntities).toContain('Alex');
      expect(ctx.threadDominantEntities.some((n) => /Mission Beach/i.test(n))).toBe(true);
    });

    it('collectPriorMentionedNames dedupes across turns', () => {
      const index: CertifiedEntity[] = [
        {
          id: 'c-1',
          name: 'Marcus',
          type: 'character',
          aliases: [],
          mentionKeys: ['marcus'],
          status: 'confirmed',
        },
      ];
      const history = [
        { role: 'user', content: 'Marcus called about the role' },
        { role: 'assistant', content: 'Marcus keeps showing up as a connector.' },
      ];

      const names = collectPriorMentionedNames(history, index);
      expect(names.filter((n) => n === 'Marcus')).toHaveLength(1);
    });
  });

  describe('intent routing (pre-LLM triage)', () => {
    it('classifies recall questions before generation', () => {
      expect(detectChatLoreIntent('What do you know about Alex?')).toBe('recall');
      expect(detectChatLoreIntent('Do you remember what I said yesterday?')).toBe('recall');
    });

    it('classifies journal and emotional intents', () => {
      expect(detectChatLoreIntent('Log this — great day at the beach')).toBe('journal');
      expect(detectChatLoreIntent('I felt really anxious after the meeting')).toBe('emotional');
    });

    it('maps thread subtitles for lore grouping', () => {
      expect(deriveChatThreadSubtitle('My girlfriend and I had a date')).toBe('Relationships');
      expect(deriveChatThreadSubtitle('Started working at a new company')).toBe('Career thread');
      expect(deriveChatThreadSubtitle('My aunt Maribel visited')).toBe('Family context');
    });
  });

  describe('loreBrief efficiency for LLM injection', () => {
    it('produces a compact structured brief with entities and ontology', () => {
      const ctx = compileChatLoreContext(
        'I worked at Vanguard Robotics and I am getting better at ROS2',
        { fallbackEntities: DEMO_FALLBACK },
      );

      expect(ctx.loreBrief).toMatch(/^ENTITIES:/m);
      expect(ctx.loreBrief).toMatch(/^INTENT:/m);
      expect(ctx.loreBrief).toMatch(/^THREAD:/m);
      expect(ctx.loreBrief.length).toBeLessThan(600);
    });

    it('does not duplicate current entities in PRIOR_THREAD line', () => {
      const ctx = compileChatLoreContext('Tell me more about Marcus at Vanguard Robotics', {
        fallbackEntities: DEMO_FALLBACK,
      });

      const brief = buildLoreBrief(ctx);
      if (brief.includes('PRIOR_THREAD')) {
        const priorLine = brief.split('\n').find((l) => l.startsWith('PRIOR_THREAD:')) ?? '';
        expect(priorLine).not.toMatch(/Marcus/i);
      }
      expect(brief).toContain('Marcus');
    });

    it('merges confirmed over draft when names collide', () => {
      const ctx = compileChatLoreContext('Alex and Alex went surfing', {
        fallbackEntities: DEMO_FALLBACK,
      });

      const alexEntries = ctx.entities.filter((e) => e.name === 'Alex');
      expect(alexEntries).toHaveLength(1);
      expect(alexEntries[0].status).toBe('confirmed');
    });
  });

  describe('edge cases', () => {
    it('returns empty entities for blank input without throwing', () => {
      const ctx = compileChatLoreContext('   ');
      expect(ctx.entities).toHaveLength(0);
      expect(ctx.loreBrief).toContain('INTENT:');
    });

    it('uses fallback entities when index misses demo seeds', () => {
      mockDataService.register.characters([]);
      mockDataService.register.locations([]);
      const ctx = compileChatLoreContext('I saw Alex in San Diego', {
        fallbackEntities: DEMO_FALLBACK,
      });

      expect(ctx.entities.some((e) => e.name === 'Alex')).toBe(true);
      expect(ctx.entities.some((e) => e.name === 'San Diego')).toBe(true);
    });

    it('detects named skills from expanded glossary without regex cues alone', () => {
      const ctx = compileChatLoreContext(
        'I have been practicing bjj and improving at ros2 on the side',
      );

      expect(ctx.ontologyHits.some((h) => h.name === 'Brazilian Jiu Jitsu' || /bjj/i.test(h.name))).toBe(true);
      expect(ctx.entities.some((e) => e.type === 'skill' && /Ros2|ROS2/i.test(e.name))).toBe(true);
    });

    it('detects extended kinship with named person', () => {
      mockDataService.register.characters([]);
      const ctx = compileChatLoreContext('My niece Sofia visited from out of town');

      expect(ctx.entities.some((e) => e.name === 'Sofia' && e.type === 'character')).toBe(true);
    });
  });
});
