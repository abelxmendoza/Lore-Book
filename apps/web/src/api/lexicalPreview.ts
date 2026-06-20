import { fetchJson } from '../lib/api';

export type LexicalPreviewSpan = {
  text: string;
  start: number;
  end: number;
  type: string;
  subtype?: string;
  colorKey: string;
  confidence: number;
  temporary: true;
  needsReview?: boolean;
  inferredAssociations?: string[];
  parentContext?: string;
  entityStatus?: 'known' | 'new';
  matchedEntityId?: string;
  matchedEntityName?: string;
};

export type LexicalPreviewResponse = {
  spans: LexicalPreviewSpan[];
  inferredAssociations: Array<{
    kind: string;
    label: string;
    confidence: number;
    inferredNotConfirmed: true;
  }>;
  ambiguities: string[];
};

export async function fetchLexicalPreview(
  text: string,
  threadId?: string
): Promise<LexicalPreviewResponse> {
  return fetchJson<LexicalPreviewResponse>('/api/lexical/preview', {
    method: 'POST',
    body: JSON.stringify({ text, threadId, mode: 'composer_preview' }),
  });
}
