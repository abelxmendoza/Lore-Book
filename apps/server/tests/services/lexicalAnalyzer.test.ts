import { describe, expect, it, vi, beforeEach } from 'vitest';

import { lexicalAnalyzerService } from '../../src/services/lexical/lexicalAnalyzerService';
import { detectLexicalSkills } from '../../src/services/lexical/lexicalSkillDetector';
import { extractLexicalEntities } from '../../src/services/lexical/lexicalEntityExtractor';
import { detectLexicalRelationships } from '../../src/services/lexical/lexicalRelationshipDetector';
import { detectLexicalPlaces } from '../../src/services/lexical/lexicalPlaceDetector';
import { detectLexicalEmotions } from '../../src/services/lexical/lexicalEmotionDetector';
import { mapGlossaryMatches } from '../../src/services/lexical/lexicalGlossaryMapper';
import { processLexicalMemoryCandidates } from '../../src/services/lexical/lexicalMemoryBridge';
import { enrichFromLexicalAnalysis } from '../../src/services/ontology/ontologyEnrichmentService';

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      insert: vi.fn().mockResolvedValue({ error: null }),
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { metadata: {} } }),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
    })),
  },
}));

vi.mock('../../src/services/memoryReviewQueueService', () => ({
  memoryReviewQueueService: {
    ingestMemory: vi.fn().mockResolvedValue({ proposal: { id: 'p1' }, auto_approved: false }),
  },
}));

vi.mock('../../src/services/omegaMemoryService', () => ({
  omegaMemoryService: {
    getEntities: vi.fn().mockResolvedValue([{ id: 'self-1', primary_name: 'Me' }]),
  },
}));

vi.mock('../../src/services/perspectiveService', () => ({
  perspectiveService: {
    getOrCreateDefaultPerspectives: vi.fn().mockResolvedValue([{ id: 'persp-1', type: 'SELF' }]),
  },
}));

const EXAMPLE =
  "I worked at Armstrong Robotics and I'm getting better at ROS2, but Muay Thai is still my main thing.";

describe('lexicalAnalyzerService', () => {
  const baseInput = {
    userId: 'user-1',
    messageId: 'msg-1',
    text: EXAMPLE,
    threadId: 'thread-1',
  };

  it('detects skills from casual messages', () => {
    const skills = detectLexicalSkills(EXAMPLE);
    const names = skills.map((s) => s.name.toLowerCase());
    expect(names.some((n) => n.includes('ros2'))).toBe(true);
    expect(names.some((n) => n.includes('muay thai'))).toBe(true);
  });

  it('distinguishes hobby vs paid skill signals', () => {
    const result = lexicalAnalyzerService.analyzeMessage(baseInput);
    const ros = result.skills.find((s) => s.name.toLowerCase().includes('ros2'));
    const muay = result.skills.find((s) => s.name.toLowerCase().includes('muay thai'));

    expect(ros?.proficiency_hint).toBe('improving');
    expect(muay?.hobby_or_paid).toBe('hobby');
    expect(muay?.enjoyment_hint).toBe('high');
    expect(muay?.lore_context).toBe('main thing');
  });

  it('detects organizations and roles', () => {
    const entities = extractLexicalEntities(EXAMPLE);
    expect(entities.some((e) => e.type === 'ORGANIZATION' && /armstrong robotics/i.test(e.surface))).toBe(true);
    expect(entities.some((e) => e.type === 'SKILL' && /ros2/i.test(e.surface))).toBe(true);
  });

  it('detects relationships', () => {
    const msg = "My estranged father still lives in Dallas and my boss is difficult.";
    const relationships = detectLexicalRelationships(msg);
    expect(relationships.some((r) => r.role === 'father')).toBe(true);
    expect(relationships.some((r) => r.role === 'boss')).toBe(true);
    expect(relationships.some((r) => r.sentiment === 'estranged')).toBe(true);
  });

  it('detects places and categories', () => {
    const msg = 'We met at the gym and then went to a bar downtown.';
    const places = detectLexicalPlaces(msg);
    expect(places.some((p) => p.category === 'gym')).toBe(true);
    expect(places.some((p) => p.category === 'bar')).toBe(true);
  });

  it('detects emotional tone', () => {
    const emotions = detectLexicalEmotions("I'm so angry and frustrated about everything.");
    expect(emotions.some((e) => e.label === 'anger' || e.label === 'frustration')).toBe(true);
    expect(emotions.every((e) => e.valence === 'negative')).toBe(true);
  });

  it('detects ambiguity on identity disambiguation', () => {
    const msg = "Abel Mendoza is actually me but it's also my estranged father";
    const result = lexicalAnalyzerService.analyzeMessage({ ...baseInput, text: msg });
    expect(result.ambiguityFlags).toContain('same_name_multiple_roles');
    expect(result.needsClarification).toBe(true);
  });

  it('maps glossary terms', () => {
    const matches = mapGlossaryMatches("my estranged father and my uncle");
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.some((m) => m.category === 'RELATIONSHIP_VERB' || m.relationshipHint === 'FAMILY_RELATIONSHIP')).toBe(true);
  });

  it('produces ontology candidates for the Armstrong Robotics example', () => {
    const result = lexicalAnalyzerService.analyzeMessage(baseInput);

    expect(result.ontologyCandidates.some((c) => c.predicate === 'worked_for' && /armstrong/i.test(c.object))).toBe(true);
    expect(result.ontologyCandidates.some((c) => c.predicate === 'is_learning' && /ros2/i.test(c.object))).toBe(true);
    expect(result.ontologyCandidates.some((c) => c.predicate === 'practices' && /muay thai/i.test(c.object))).toBe(true);
  });

  it('produces memory candidates without directly mutating memory', () => {
    const result = lexicalAnalyzerService.analyzeMessage(baseInput);
    expect(result.memoryCandidates.some((c) => /improving at ros2/i.test(c.claim))).toBe(true);
    expect(result.memoryCandidates.some((c) => /important to the user/i.test(c.claim))).toBe(true);
  });

  it('enriches ontology metadata from lexical analysis', () => {
    const result = lexicalAnalyzerService.analyzeMessage(baseInput);
    const meta = enrichFromLexicalAnalysis(result);
    expect(meta.source).toBe('lexical_analyzer');
    expect(Array.isArray(meta.lexical_ontology_candidates)).toBe(true);
  });

  it('queues memory candidates through review pipeline, not direct writes', async () => {
    const { memoryReviewQueueService } = await import('../../src/services/memoryReviewQueueService');
    const result = lexicalAnalyzerService.analyzeMessage(baseInput);
    const { queued } = await processLexicalMemoryCandidates('user-1', 'msg-1', result);
    expect(queued).toBeGreaterThan(0);
    expect(memoryReviewQueueService.ingestMemory).toHaveBeenCalled();
  });
});
