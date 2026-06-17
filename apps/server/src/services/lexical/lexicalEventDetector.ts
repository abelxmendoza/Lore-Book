/**
 * Life event signal detection from lexical cues.
 */
import type { LexicalEventSignal, LifeEventKind } from './lexicalTypes';
import { padForScan } from './lexicalNormalizer';

type EventPattern = { kind: LifeEventKind; cues: string[]; confidence?: number };

const EVENT_PATTERNS: EventPattern[] = [
  { kind: 'job_started', cues: ['started working', 'got hired', 'joined', 'new job', 'worked at'], confidence: 0.8 },
  { kind: 'job_ended', cues: ['quit', 'resigned', 'laid off', 'fired', 'left my job', 'job ended'], confidence: 0.82 },
  { kind: 'promotion', cues: ['got promoted', 'promotion', 'raised to'], confidence: 0.85 },
  { kind: 'interview', cues: ['interview', 'interviewed for', 'job interview'], confidence: 0.8 },
  { kind: 'conflict', cues: ['argument', 'fight with', 'fell out', 'beef with', 'conflict with'], confidence: 0.75 },
  { kind: 'breakup', cues: ['broke up', 'breakup', 'split up', 'divorced'], confidence: 0.85 },
  { kind: 'achievement', cues: ['won', 'achieved', 'accomplished', 'graduated', 'certified', 'earned'], confidence: 0.78 },
  { kind: 'training', cues: ['training camp', 'bootcamp', 'class started', 'belt test'], confidence: 0.72 },
  { kind: 'travel', cues: ['traveled to', 'trip to', 'vacation', 'flew to', 'visited'], confidence: 0.75 },
  { kind: 'illness', cues: ['sick', 'hospital', 'diagnosed', 'injury', 'injured'], confidence: 0.78 },
  { kind: 'financial_change', cues: ['raise', 'bonus', 'debt', 'bankruptcy', 'invested', 'paid off'], confidence: 0.7 },
  { kind: 'project_milestone', cues: ['shipped', 'launched', 'released', 'milestone', 'deployed'], confidence: 0.8 },
  { kind: 'social_event', cues: ['party', 'wedding', 'reunion', 'concert', 'festival'], confidence: 0.72 },
  { kind: 'rejection', cues: ['rejected', 'turned down', 'didn\'t get'], confidence: 0.8 },
  { kind: 'reconciliation', cues: ['made up', 'reconciled', 'patched things up'], confidence: 0.78 },
  { kind: 'learning_moment', cues: ['learned that', 'realized', 'figured out', 'getting better at', 'aha moment'], confidence: 0.7 },
];

export function detectLexicalEvents(text: string): LexicalEventSignal[] {
  const padded = padForScan(text);
  const events: LexicalEventSignal[] = [];
  const seen = new Set<LifeEventKind>();

  for (const { kind, cues, confidence = 0.7 } of EVENT_PATTERNS) {
    for (const cue of cues) {
      if (!padded.includes(cue)) continue;
      if (seen.has(kind)) break;
      seen.add(kind);
      events.push({ kind, cue, confidence });
      break;
    }
  }

  return events;
}
