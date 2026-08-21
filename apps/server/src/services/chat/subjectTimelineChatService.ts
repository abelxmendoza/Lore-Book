import { selfCharacterService } from '../selfCharacterService';
import {
  compileSubjectTimelineForUser,
  type CompiledSubjectTimelineEvent,
} from '../timeline/subjectTimelineCompiler';

export type SubjectTimelineChatResponse = {
  content: string;
  response_mode: 'SUBJECT_TIMELINE' | 'TIMELINE_DEGRADED' | 'TIMELINE_DISAMBIGUATION';
  confidence: number;
  metadata: Record<string, unknown>;
};

function dateLabel(value: string, precision: string): string {
  if (!value || precision === 'sequence_only' || precision === 'unresolved' || precision === 'unknown') {
    return 'Date unknown';
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Date unknown';
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: precision === 'year' ? undefined : 'short',
    day: precision === 'date' || precision === 'day' ? 'numeric' : undefined,
    timeZone: 'UTC',
  });
}

function eventLine(event: CompiledSubjectTimelineEvent): string {
  const when = event.occurred_at ?? (event.occurrence_status === 'unresolved' ? '' : event.start_time);
  const date = dateLabel(when, event.time_precision);
  const status = event.occurrence_status === 'unresolved' ? ' · date unknown' : '';
  const recorded =
    event.occurrence_status === 'unresolved' && event.recorded_at
      ? `\nRecorded ${dateLabel(event.recorded_at, 'date')}`
      : '';
  return `**${date} — ${event.title}**${status}${recorded}\n${event.content}`;
}

export async function buildSubjectTimelineChatResponse(input: {
  userId: string;
  message: string;
  threadId?: string;
  messageId?: string;
}): Promise<SubjectTimelineChatResponse> {
  if (input.messageId) {
    await selfCharacterService.capturePreferredStageNameCorrection(
      input.userId,
      input.message,
      input.messageId,
    );
  }
  const compilation = await compileSubjectTimelineForUser({
    userId: input.userId,
    query: input.message,
    threadId: input.threadId,
  });

  if (!compilation.subject && compilation.ambiguity.length > 0) {
    const choices = compilation.ambiguity
      .map((subject) => `• ${subject.displayName} (${subject.entityType})`)
      .join('\n');
    return {
      content: `I found more than one possible timeline subject. Which one did you mean?\n\n${choices}`,
      response_mode: 'TIMELINE_DISAMBIGUATION',
      confidence: 0.5,
      metadata: {
        timeline_status: 'ambiguous',
        timeline_compilation: compilation,
      },
    };
  }

  const subjectName = compilation.subject?.displayName ?? compilation.intent.subjectQuery;
  const allEvents = [...compilation.events, ...compilation.contextEvents];
  if (allEvents.length === 0) {
    return {
      content:
        `I recognized this as a timeline request for ${subjectName}, but I could not find enough subject-linked evidence to build it yet.`,
      response_mode: 'TIMELINE_DEGRADED',
      confidence: 0.25,
      metadata: {
        timeline_status: 'partial',
        timeline_compilation: compilation,
        degraded_reasons: compilation.warnings,
        sources: [],
      },
    };
  }

  const partial = !compilation.coverage.isComplete || compilation.warnings.length > 0;
  const lines = compilation.events.map(eventLine);
  const contextLines = compilation.contextEvents.map(eventLine);
  const caveat = partial
    ? '\n\n*This is a partial timeline. Some periods may still be provisional or missing from canonical records.*'
    : '';
  const related = contextLines.length
    ? `\n\n**Related context**\n\n${contextLines.join('\n\n')}`
    : '';

  return {
    content: `## Your ${subjectName} timeline\n\n${lines.join('\n\n')}${related}${caveat}`,
    response_mode: partial ? 'TIMELINE_DEGRADED' : 'SUBJECT_TIMELINE',
    confidence: Math.max(0.35, compilation.coverage.score),
    metadata: {
      timeline_status: partial ? 'partial' : 'complete',
      timeline_compilation: compilation,
      degraded_reasons: compilation.warnings,
      sources: allEvents.map((event) => ({
        type: event.source_kind === 'journal_entry' ? 'entry' : 'event',
        id: event.source_id,
        title: event.title,
        snippet: event.focusedEvidence || event.content,
        date: event.occurred_at,
        relevanceScore: Math.round(event.relevance * 100),
        relevanceReasons: [event.whyIncluded],
        usage: 'supporting',
      })),
    },
  };
}
