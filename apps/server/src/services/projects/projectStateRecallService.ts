import { config } from '../../config';
import { logger } from '../../logger';
import { normalizeNameKey } from '../../utils/nameNormalization';
import { assembleWorkingMemory, buildWorkingMemoryPacket, type WorkingMemoryItem } from '../chat/workingMemoryAssembler';
import { openai } from '../openaiClient';
import { projectService, type ProjectRow } from '../projectService';

const STATE_LANGUAGE_RE =
  /\b(?:current|latest|present)\s+(?:state|status)|\bwhere\s+(?:are we|does\s+.+?\s+stand)\b|\bwhat(?:'s| is| has been)\s+(?:completed|finished|shipped|done)|\bhow\s+(?:far along|is\s+.+?\s+(?:going|progressing))\b|\blatest\s+milestone\b/i;
const NEXT_LANGUAGE_RE =
  /\bwhat\s+should\s+(?:i|we)\s+(?:do|work on|focus on|prioritize)\s+next\b|\bnext\s+(?:step|priority|milestone)\b|\bwhere\s+(?:do|should)\s+(?:i|we)\s+go\s+from\s+here\b/i;

export function isProjectStateRecallShape(message: string): boolean {
  const text = message.trim();
  if (!text || !/[?]|^(?:what|where|how)/i.test(text)) return false;
  if (
    /\b(?:my life|life overall|my relationship|our relationship|my health|my career|my family)\b/i.test(text) &&
    !/\b(?:project|projects|build|builds|initiative|initiatives|workstream|workstreams)\b/i.test(text)
  ) {
    return false;
  }
  return STATE_LANGUAGE_RE.test(text) || NEXT_LANGUAGE_RE.test(text);
}

function projectNames(project: ProjectRow): string[] {
  const aliases = Array.isArray(project.metadata?.aliases)
    ? project.metadata.aliases.filter((value): value is string => typeof value === 'string')
    : [];
  return [project.name, project.normalized_name, ...aliases].filter(Boolean);
}

function normalizePhrase(value: string): string {
  return normalizeNameKey(value).replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

function mentionsProject(message: string, project: ProjectRow): boolean {
  const messageKey = normalizePhrase(message);
  return projectNames(project).some((name) => {
    const nameKey = normalizePhrase(name);
    return nameKey.length >= 3 && (` ${messageKey} `).includes(` ${nameKey} `);
  });
}

export async function resolveProjectStateTarget(
  userId: string,
  message: string,
): Promise<ProjectRow | null> {
  if (!isProjectStateRecallShape(message)) return null;
  const projects = await projectService.listProjects(userId);
  return projects
    .filter((project) => mentionsProject(message, project))
    .sort((a, b) => b.name.length - a.name.length)[0] ?? null;
}

function supportingItems(assembly: Awaited<ReturnType<typeof assembleWorkingMemory>>): WorkingMemoryItem[] {
  const all = [
    ...assembly.projects,
    ...assembly.goals,
    ...assembly.events,
    ...assembly.episodes,
    ...assembly.timeline,
    ...assembly.claims,
  ];
  const seen = new Set<string>();
  return all.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function sourceType(item: WorkingMemoryItem): 'entry' | 'event' | 'knowledge' {
  if (item.type === 'event') return 'event';
  if (item.sourceMessageIds?.length || item.type === 'episode') return 'entry';
  return 'knowledge';
}

export async function answerProjectStateRecall(input: {
  userId: string;
  message: string;
  threadId?: string;
}): Promise<{
  content: string;
  confidence: number;
  metadata: Record<string, unknown>;
}> {
  const project = await resolveProjectStateTarget(input.userId, input.message);
  if (!project) {
    return {
      content: "I couldn't resolve a canonical project in that question, so I won't invent a status or roadmap. Name the project exactly as it appears in your Projects Book and I'll try again.",
      confidence: 1,
      metadata: { groundingRequired: true, grounded: false, sources: [] },
    };
  }

  const retrievalQuestion = `What is the current state of project ${project.name}, what milestones have been completed, what remains unresolved, and what should happen next?`;
  const assembly = await assembleWorkingMemory(
    { userId: input.userId, question: retrievalQuestion, threadId: input.threadId },
    { maxItems: 18 },
  );
  const evidence = supportingItems(assembly);
  const projectSource = {
    type: 'knowledge' as const,
    id: project.id,
    title: project.name,
    snippet: project.summary ?? project.description ?? `${project.status ?? 'unknown'} project`,
    date: project.updated_at,
    relevanceScore: 100,
    relevanceReasons: ['canonical project matched by name'],
    usage: 'supporting' as const,
  };
  const sources = [
    projectSource,
    ...evidence.slice(0, 12).map((item) => ({
      type: sourceType(item),
      id: item.sourceMessageIds?.[0] ?? item.id,
      title: item.title,
      snippet: item.content.slice(0, 240),
      date: item.date ?? undefined,
      relevanceScore: Math.round(item.score * 100),
      relevanceReasons: item.reasons.slice(0, 3),
      usage: 'supporting' as const,
    })),
  ];
  const recallSources = evidence.flatMap((item) => {
    const entryId = item.sourceMessageIds?.[0];
    if (!entryId) return [];
    return [{
      entry_id: entryId,
      timestamp: item.date ?? project.updated_at,
      summary: item.content.slice(0, 300),
      entities: [project.name],
    }];
  });
  const retrievalTiming = assembly.timing;
  const retrievalMetadata = {
    projectId: project.id,
    workingMemory: assembly,
    sources,
    recall_sources: recallSources,
    recall: {
      attempted: true,
      sourceCount: sources.length,
      workingMemoryItems: evidence.length,
      projectId: project.id,
    },
    ragStats: {
      sourceCount: sources.length,
      cacheHit: Boolean(retrievalTiming?.queries.length) && Boolean(retrievalTiming?.queries.every((query) => query.cached)),
      retrievalMs: retrievalTiming?.totalMs ?? 0,
      contextItems: evidence.length,
    },
  };

  // A canonical project card can establish status, but it cannot establish a
  // development history or defensible recommendation on its own.
  if (evidence.length === 0) {
    const knownState = [project.status, project.summary ?? project.description].filter(Boolean).join(' — ');
    return {
      content: `I found **${project.name}** in your Projects Book${knownState ? `: ${knownState}` : ''}. I couldn't find grounded milestone or unresolved-work records for it, so I can't responsibly recommend the next priority yet. Add or link project updates and I can synthesize them.`,
      confidence: 0.55,
      metadata: {
        groundingRequired: true,
        grounded: true,
        groundingCoverage: 'canonical_state_only',
        ...retrievalMetadata,
      },
    };
  }

  const packet = buildWorkingMemoryPacket(assembly);
  const numberedEvidence = evidence
    .slice(0, 12)
    .map((item, index) => `[${index + 2}] ${item.title}\n${item.content}\nsource=${item.source}; date=${item.date ?? 'unknown'}; confidence=${item.confidence.toFixed(2)}`)
    .join('\n\n');
  const canonical = JSON.stringify({
    name: project.name,
    type: project.type,
    status: project.status,
    summary: project.summary,
    description: project.description,
    startedAt: project.started_at,
    endedAt: project.ended_at,
    updatedAt: project.updated_at,
    currentFocus: project.metadata?.current_focus ?? null,
    canonicalState: project.metadata?.canonical_state ?? null,
  });

  try {
    const completion = await openai.chat.completions.create({
      model: config.chatModel,
      temperature: 0.2,
      max_tokens: 650,
      messages: [
        {
          role: 'system',
          content: `You are LoreBook's grounded project-state composer. Answer only from the canonical project record and retrieved evidence below. Do not add generic product advice, guessed milestones, or outside knowledge. Separate "Current state" from "Next priority". Rank recent explicit milestones above older background. Cite supporting records inline as [1], [2], etc. If the evidence does not support a recommendation, say that plainly. Keep the answer concise.`,
        },
        {
          role: 'user',
          content: `Question: ${input.message}\n\n[1] CANONICAL PROJECT\n${canonical}\n\nNUMBERED SUPPORTING RECORDS\n${numberedEvidence}\n\nRETRIEVAL DIAGNOSTICS\n${packet.text}`,
        },
      ],
    });
    const content = completion.choices[0]?.message?.content?.trim();
    if (!content) throw new Error('Project-state composer returned empty content');
    return {
      content,
      confidence: assembly.confidence,
      metadata: {
        groundingRequired: true,
        grounded: true,
        groundingCoverage: 'project_state_and_history',
        ...retrievalMetadata,
      },
    };
  } catch (error) {
    logger.warn({ error, userId: input.userId, projectId: project.id }, 'Project-state synthesis failed');
    const recent = evidence.slice(0, 4).map((item) => `- ${item.title}: ${item.content}`).join('\n');
    return {
      content: `**Current state**\n${project.name} is recorded as **${project.status ?? 'status unknown'}**.${project.summary ? ` ${project.summary}` : ''}\n\n**Grounded recent context**\n${recent}\n\n**Next priority**\nI found the project history, but couldn't complete the grounded synthesis. I won't substitute speculative roadmap advice; retry the response to run the synthesis again.`,
      confidence: Math.min(assembly.confidence, 0.7),
      metadata: {
        groundingRequired: true,
        grounded: true,
        synthesisFailed: true,
        ...retrievalMetadata,
      },
    };
  }
}
