#!/usr/bin/env tsx
/**
 * Chat Memory Utilization Audit — Phases 2 & 3.
 *
 * Run:
 *   npx tsx apps/server/scripts/chatMemoryUtilizationAudit.ts
 */
import { assembleWorkingMemory, buildWorkingMemoryPacket } from '../src/services/chat/workingMemoryAssembler';
import { buildRAGPacket } from '../src/services/chat/ragBuilderService';
import { buildSystemPrompt } from '../src/services/chat/systemPromptBuilder';
import { scoreContext } from '../src/services/chat/contextScoringService';
import { config } from '../src/config';
import { supabaseAdmin } from '../src/services/supabaseClient';

const RECALL_QUESTIONS = [
  'Who lives with me?',
  'What happened with Sol?',
  'What did I do with Abuela?',
  'Who is Andrew?',
  'What role did Kelly play?',
  'How am I related to Tio Juan?',
  "What happened at Leslie's Graduation Party?",
  'Tell me about my mom',
  'What do you know about Club Metro?',
  'What happened at Costco with Abuela?',
  'Who is Jerry?',
  'What is my relationship with Leslie?',
  'What happened at Amazon onboarding?',
  'What skills do I have?',
  'What are my current goals?',
  'Summarize what you know about my family',
  'What happened last summer?',
  'Who did I go to the bar with?',
  'What projects am I working on?',
  'What communities am I part of?',
];

function estTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

async function resolveFounderId(): Promise<string> {
  if (config.ownerUserId?.trim()) return config.ownerUserId.trim();
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const match = data.users.find((u) => {
    const role = String(u.app_metadata?.role ?? '').toLowerCase();
    return role === 'admin' || role === 'owner' || u.email?.toLowerCase() === config.ownerEmail?.toLowerCase();
  });
  if (!match) throw new Error('Could not resolve founder account');
  return match.id;
}

async function auditQuestion(userId: string, question: string) {
  const assembly = await assembleWorkingMemory({ userId, question });
  const packet = buildWorkingMemoryPacket(assembly);

  const rag = await buildRAGPacket(userId, question);
  const rawLoreData = {
    allCharacters: rag.allCharacters,
    allLocations: rag.allLocations,
    allChapters: rag.allChapters,
    timelineHierarchy: rag.timelineHierarchy,
    allPeoplePlaces: rag.allPeoplePlaces,
    essenceProfile: null,
    identityCoreProfile: null,
    characterAttributesMap: rag.characterAttributesMap,
    characterMemoriesMap: (rag as { characterMemoriesMap?: Record<string, unknown[]> }).characterMemoriesMap,
    romanticRelationships: rag.romanticRelationships,
    romanticContext: rag.romanticContext ?? [],
    corrections: rag.corrections,
    deprecatedUnits: rag.deprecatedUnits,
    workoutEvents: rag.workoutEvents,
    recentBiometrics: rag.recentBiometrics,
    topInterests: rag.topInterests,
    recentInterpretations: rag.recentInterpretations,
    stableArcs: rag.stableArcs,
    episodicEvents: rag.episodicEvents,
    socialCommunities: rag.socialCommunities,
    crystallizedKnowledge: rag.crystallizedKnowledge ?? [],
    confirmedSkills: (rag as { confirmedSkills?: unknown[] }).confirmedSkills ?? [],
    entityDossierBlock: (rag as { entityDossierBlock?: string | null }).entityDossierBlock ?? null,
    entityArcNarrativeBlock: rag.entityArcNarrativeBlock ?? null,
    knowledgeGapBlock: (rag as { knowledgeGapBlock?: string | null }).knowledgeGapBlock ?? null,
    foundationRecallBlock: (rag as { foundationRecallBlock?: string }).foundationRecallBlock ?? '',
    foundationRelationships: (rag as { foundationRelationships?: unknown[] }).foundationRelationships ?? [],
    foundationTimeline: (rag as { foundationTimeline?: unknown[] }).foundationTimeline ?? [],
    workingMemory: (rag as { workingMemory?: unknown }).workingMemory ?? null,
    workingMemoryPacket: (rag as { workingMemoryPacket?: unknown }).workingMemoryPacket ?? null,
  };

  const scoring = scoreContext(
    rawLoreData as Record<string, unknown>,
    question,
    rag.allCharacters ?? [],
    rag.allLocations ?? []
  );

  const systemPrompt = buildSystemPrompt(
    { timeline: { events: [], arcs: [] }, characters: [] },
    [],
    [],
    '',
    [],
    scoring.filteredLoreData as Parameters<typeof buildSystemPrompt>[5],
    undefined,
    null,
    null,
    null,
    null,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    userId
  );

  const wmBlock = String((rag as { foundationRecallBlock?: string }).foundationRecallBlock ?? '');
  const hasWmInPrompt = systemPrompt.includes('WORKING MEMORY');
  const hasDossier = Boolean((scoring.filteredLoreData as { entityDossierBlock?: string }).entityDossierBlock);
  const hasArc = Boolean((scoring.filteredLoreData as { entityArcNarrativeBlock?: string }).entityArcNarrativeBlock);
  const hasSkills = ((scoring.filteredLoreData as { confirmedSkills?: unknown[] }).confirmedSkills?.length ?? 0) > 0;

  return {
    question,
    intent: assembly.intent,
    wmaConfidence: assembly.confidence,
    retrieved: {
      entities: assembly.entities.length,
      episodes: assembly.episodes.length,
      events: assembly.events.length,
      relationships: assembly.relationships.length,
      goals: assembly.goals.length,
      skills: assembly.skills.length,
      projects: assembly.projects.length,
      communities: assembly.communities.length,
      timeline: assembly.timeline.length,
      preferences: assembly.preferences.length,
    },
    wmaSelected: assembly.budget.selected,
    wmaRejected: assembly.budget.rejected,
    packetChars: packet.length,
    prompt: {
      systemPromptTokens: estTokens(systemPrompt),
      wmBlockTokens: estTokens(wmBlock),
      wmInPrompt: hasWmInPrompt,
      entityDossierInScored: hasDossier,
      entityArcInScored: hasArc,
      skillsInScored: hasSkills,
      scoringReductionPct: scoring.reductionPct,
      scoringTokensBefore: scoring.tokensBefore,
      scoringTokensAfter: scoring.tokensAfter,
      droppedBlocks: scoring.scores.filter((s) => s.decision === 'EXCLUDE').map((s) => s.key),
    },
  };
}

async function main() {
  const userId = await resolveFounderId();
  console.error(`Chat memory utilization audit — founder ${userId.slice(0, 8)}…`);
  console.error(`Tracing ${RECALL_QUESTIONS.length} questions…`);

  const results = [];
  for (const q of RECALL_QUESTIONS) {
    process.stderr.write(`  · ${q.slice(0, 50)}…\n`);
    results.push(await auditQuestion(userId, q));
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    questionCount: results.length,
    avgWmaSelected: Math.round(results.reduce((s, r) => s + r.wmaSelected, 0) / results.length),
    avgWmaRejected: Math.round(results.reduce((s, r) => s + r.wmaRejected, 0) / results.length),
    avgSystemPromptTokens: Math.round(results.reduce((s, r) => s + r.prompt.systemPromptTokens, 0) / results.length),
    questionsWithZeroEvents: results.filter((r) => r.retrieved.events === 0).length,
    questionsWithZeroRelationships: results.filter((r) => r.retrieved.relationships === 0).length,
    questionsWithZeroGoals: results.filter((r) => r.retrieved.goals === 0).length,
    questionsWithZeroSkills: results.filter((r) => r.retrieved.skills === 0).length,
    questionsWithZeroProjects: results.filter((r) => r.retrieved.projects === 0).length,
    questionsWithZeroCommunities: results.filter((r) => r.retrieved.communities === 0).length,
    questionsWithZeroEpisodes: results.filter((r) => r.retrieved.episodes === 0).length,
    entityDossierDropRate: results.filter((r) => !r.prompt.entityDossierInScored).length,
    entityArcDropRate: results.filter((r) => !r.prompt.entityArcInScored).length,
    results,
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
