import type { QuestLogContext, QuestLogStatusHint } from './questLogInferenceTypes';

export function extractEvidencePhrases(text: string, span: string): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const needle = span.toLowerCase();
  return sentences
    .filter((s) => s.toLowerCase().includes(needle))
    .map((s) => s.trim())
    .slice(0, 4);
}

export function inferStatusHint(text: string): QuestLogStatusHint {
  if (/\b(?:blocked|blocking|invalid|failed|broken|doesn'?t show|stuck)\b/i.test(text)) return 'blocked';
  if (/\b(?:finished|built|shipped|passed|completed|done)\b/i.test(text)) return 'done';
  if (/\b(?:stopped|paused|haven'?t touched|on hold)\b/i.test(text)) return 'paused';
  if (/\b(?:working on|building|doing|in progress)\b/i.test(text)) return 'active';
  if (/\b(?:need to|should|next|plan to|going to)\b/i.test(text)) return 'planned';
  return 'unknown';
}

export function inferLifeArea(text: string, displayName: string): QuestLogContext['lifeArea'] {
  const blob = `${text} ${displayName}`.toLowerCase();
  if (/\b(?:debt|pay off|finance|money|loan)\b/.test(blob)) return 'finance';
  if (/\b(?:robotics|ai job|career|spacex|amazon|interview|hire)\b/.test(blob)) return 'career';
  if (/\b(?:run|train|muay thai|health|gym)\b/.test(blob)) return 'health';
  if (/\b(?:lorebook|parser|compiler|feature|mvp|deploy)\b/.test(blob)) return 'product';
  if (/\b(?:school|class|homework|college)\b/.test(blob)) return 'school';
  if (/\b(?:family|move out|apartment)\b/.test(blob)) return 'family';
  if (/\b(?:relationship|dating)\b/.test(blob)) return 'relationships';
  if (/\b(?:work|shift|office)\b/.test(blob)) return 'work';
  return 'personal';
}

export function buildQuestLogContext(
  text: string,
  displayName: string,
  partial: QuestLogContext = {},
): QuestLogContext {
  return {
    ...partial,
    projectContext: partial.projectContext ?? extractProjectContext(text),
    lifeArea: partial.lifeArea ?? inferLifeArea(text, displayName),
    statusHint: partial.statusHint ?? inferStatusHint(text),
    urgency: partial.urgency ?? inferUrgency(text),
    deadlineHint: partial.deadlineHint ?? extractDeadlineHint(text),
    blockerReason: partial.blockerReason ?? extractBlockerReason(text),
  };
}

function extractProjectContext(text: string): string | undefined {
  if (/\bLoreBook\b/i.test(text)) return 'LoreBook';
  if (/\bOmega-1\b/i.test(text)) return 'Omega-1';
  if (/\bAbeliciousness\b/i.test(text)) return 'Abeliciousness';
  return undefined;
}

function inferUrgency(text: string): QuestLogContext['urgency'] {
  if (/\b(?:now|today|asap|urgent|blocking production)\b/i.test(text)) return 'now';
  if (/\b(?:soon|this week|next)\b/i.test(text)) return 'soon';
  if (/\b(?:later|someday|eventually)\b/i.test(text)) return 'later';
  return 'unknown';
}

function extractDeadlineHint(text: string): string | undefined {
  const m = text.match(/\b(?:by|before)\s+([A-Za-z]+(?:\s+\d{1,2})?)\b/i);
  return m?.[0]?.trim();
}

function extractBlockerReason(text: string): string | undefined {
  const m = text.match(/\b([^,.!?]{8,80})\s+(?:is\s+)?(?:blocking|blocked|invalid|failed)\b/i);
  return m?.[1]?.trim();
}

export function hasProvenance(candidate: {
  sourceMessageIds: string[];
  evidencePhrases: string[];
  context: QuestLogContext;
}): boolean {
  return (
    candidate.sourceMessageIds.length > 0 &&
    candidate.evidencePhrases.length > 0 &&
    Boolean(
      candidate.context.statusHint && candidate.context.statusHint !== 'unknown'
        ? true
        : candidate.context.projectContext ||
            candidate.context.lifeArea ||
            candidate.context.blockerReason,
    )
  );
}
