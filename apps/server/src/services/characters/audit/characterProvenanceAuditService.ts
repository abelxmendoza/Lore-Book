import type { CharacterCardAuditInput } from './characterCardAuditTypes';

/** Collect provenance text from character row metadata and mention context. */
export function extractProvenanceText(input: CharacterCardAuditInput): string {
  const parts: string[] = [];
  if (input.contextOfMention?.trim()) parts.push(input.contextOfMention.trim());
  if (input.provenanceText?.trim()) parts.push(input.provenanceText.trim());

  const meta = input.metadata ?? {};
  for (const key of [
    'provenanceSummary',
    'storyContext',
    'story_context',
    'sourceSnippet',
    'mentionContext',
    'ambiguousContext',
    'extractionSource',
  ]) {
    const val = meta[key];
    if (typeof val === 'string' && val.trim()) parts.push(val.trim());
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      parts.push(JSON.stringify(val));
    }
  }

  if (Array.isArray(meta.sourceMessageIds)) {
    parts.push(`messages:${meta.sourceMessageIds.join(',')}`);
  }

  return parts.join('\n');
}

export function summarizeProvenance(text: string, maxLen = 160): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'No provenance captured yet';
  return cleaned.length <= maxLen ? cleaned : `${cleaned.slice(0, maxLen - 1)}…`;
}
