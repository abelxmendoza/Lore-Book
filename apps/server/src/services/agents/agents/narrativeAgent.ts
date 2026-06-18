/**
 * NARRATIVE AGENT (v1 — deterministic)
 *
 * Detects when a message carries narrative weight — events, emotional content,
 * turning points — and suggests refreshing the user's story summary. It is
 * intentionally selective: it does NOT run on small talk or trivia. The actual
 * narrative summary is owned by StoryOfSelfEngine; this agent only proposes a
 * refresh, it does not regenerate or write narrative state.
 */

import type {
  LoreAgent,
  LoreAgentInput,
  LoreAgentResult,
  LoreAgentObservation,
  LoreAgentProposedAction,
  LoreAgentEvidence,
  LoreAgentWarning,
} from '../loreAgentTypes';

/** A message must clear this narrative-significance score to be worth a summary refresh. */
const SIGNIFICANCE_THRESHOLD = 2;

interface NarrativeSignals {
  wordCount: number;
  eventCount: number;
  emotionCount: number;
  pastStatementCount: number;
  score: number;
}

function computeSignals(input: Omit<LoreAgentInput, 'tools'>): NarrativeSignals {
  const { lexical, meaning } = input.pipelineResult;
  const wordCount = input.userMessage.trim().split(/\s+/).filter(Boolean).length;
  const eventCount = meaning?.resolvedEvents.length ?? 0;
  const emotionCount = Array.isArray(lexical?.emotions) ? lexical.emotions.length : 0;
  const pastStatementCount =
    meaning?.temporalContext.statements.filter((s) => s.status === 'past' || s.status === 'former').length ?? 0;

  // Weighted, deterministic. Events and emotion are the strongest narrative cues.
  let score = 0;
  score += eventCount * 2;
  score += emotionCount;
  score += pastStatementCount;
  if (wordCount >= 40) score += 1;

  return { wordCount, eventCount, emotionCount, pastStatementCount, score };
}

class NarrativeAgent implements LoreAgent {
  readonly name = 'NarrativeAgent';

  shouldRun(input: Omit<LoreAgentInput, 'tools'>): boolean {
    if (!input.pipelineResult.meaning) return false;
    return computeSignals(input).score >= SIGNIFICANCE_THRESHOLD;
  }

  async run(input: LoreAgentInput): Promise<LoreAgentResult> {
    const startedAt = new Date().toISOString();
    const { meaning } = input.pipelineResult;
    const signals = computeSignals(input);

    const observations: LoreAgentObservation[] = [];
    const proposedActions: LoreAgentProposedAction[] = [];
    const warnings: LoreAgentWarning[] = [];

    const evidence: LoreAgentEvidence[] = [
      {
        kind: 'pipeline_stage',
        ref: 'storyOfSelfEngine',
        detail: `events=${signals.eventCount}, emotions=${signals.emotionCount}, pastStatements=${signals.pastStatementCount}`,
        sourceFile: 'apps/server/src/services/storyOfSelf/storyOfSelfEngine.ts',
      },
    ];

    observations.push({
      kind: 'narrative_signal',
      summary: `Narratively significant message (score ${signals.score}): ${signals.eventCount} event(s), ${signals.emotionCount} emotion cue(s).`,
      confidence: Math.min(1, signals.score / 6),
      evidence,
    });

    proposedActions.push({
      type: 'propose_narrative_update',
      label: 'Refresh story summary with this moment',
      payload: {
        reason: 'narrative_significance',
        signals,
        events: (meaning?.resolvedEvents ?? []).map((e) => ({ kind: e.kind, cue: e.cue })),
      },
      confidence: Math.min(1, signals.score / 6),
      requiresConfirmation: true,
      routeTo: 'none',
    });

    return {
      agentName: this.name,
      runId: input.runId,
      observations,
      proposedActions,
      confidence: Math.min(1, signals.score / 6),
      evidence,
      warnings,
      startedAt,
      completedAt: new Date().toISOString(),
    };
  }
}

export const narrativeAgent = new NarrativeAgent();
