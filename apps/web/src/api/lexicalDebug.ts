import { fetchJson } from '../lib/api';

export type LexicalIntelligenceSpan = {
  id: string;
  text: string;
  start: number;
  end: number;
  type: string;
  subtype?: string;
  confidence: number;
  evidencePhrases: string[];
  contextWindow: { before: string; match: string; after: string };
  detectionSource: string;
  alternatives: Array<{ type: string; subtype?: string; confidence: number; reason: string }>;
  status: string;
  rulesFired?: string[];
  parentSpanId?: string;
};

export type LexicalDebugResponse = {
  spans: LexicalIntelligenceSpan[];
  rulesFired: string[];
  overlapsResolved: Array<{ keptId: string; droppedIds: string[]; reason: string }>;
  missedCandidates: Array<{ text: string; reason: string }>;
  warnings: string[];
  spanCount: number;
  averageConfidence: number;
};

export function fetchLexicalDebug(
  text: string,
  opts: { includeContext?: boolean; includeAlternatives?: boolean } = {}
): Promise<LexicalDebugResponse> {
  return fetchJson<LexicalDebugResponse>('/api/lexical/debug', {
    method: 'POST',
    body: JSON.stringify({
      text,
      includeContext: opts.includeContext ?? true,
      includeAlternatives: opts.includeAlternatives ?? true,
    }),
  });
}

export function isLexicalDebugEnabled(): boolean {
  return import.meta.env.DEV;
}
