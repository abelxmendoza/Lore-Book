import type { CharacterCardAuditInput } from './characterCardAuditTypes';

const PROVENANCE_META_KEYS = [
  'provenanceSummary',
  'provenanceNarrative',
  'storyContext',
  'story_context',
  'sourceSnippet',
  'mentionContext',
  'ambiguousContext',
  'extractionSource',
] as const;

function coreForCompare(text: string): string {
  return text
    .replace(/^[….]+/, '')
    .replace(/[….]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Keep the longest unique quotes; drop windowed snippets already covered by a fuller source. */
export function mergeProvenanceParts(rawParts: string[]): string {
  const cleaned = rawParts
    .map((part) => part.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim())
    .filter(Boolean);

  const kept: string[] = [];
  for (const part of cleaned) {
    const core = coreForCompare(part);
    if (!core) continue;
    const idx = kept.findIndex((existing) => {
      const existingCore = coreForCompare(existing);
      return existingCore.includes(core) || core.includes(existingCore);
    });
    if (idx === -1) {
      kept.push(part);
      continue;
    }
    if (part.length > kept[idx].length) kept[idx] = part;
  }
  return kept.join('\n\n');
}

/** Collect provenance text from character row metadata and mention context. */
export function extractProvenanceText(input: CharacterCardAuditInput): string {
  const parts: string[] = [];
  if (input.contextOfMention?.trim()) parts.push(input.contextOfMention.trim());
  if (input.provenanceText?.trim()) parts.push(input.provenanceText.trim());

  const meta = input.metadata ?? {};
  for (const key of PROVENANCE_META_KEYS) {
    const val = meta[key];
    if (typeof val === 'string' && val.trim()) parts.push(val.trim());
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      parts.push(JSON.stringify(val));
    }
  }

  return mergeProvenanceParts(parts);
}

export function summarizeProvenance(text: string, maxLen?: number): string {
  const cleaned = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (!cleaned) return 'No provenance captured yet';
  if (maxLen != null && cleaned.length > maxLen) {
    return `${cleaned.slice(0, maxLen - 1)}…`;
  }
  return cleaned;
}

export function collectSourceMessageIds(roster: CharacterCardAuditInput[]): string[] {
  const ids = new Set<string>();
  for (const row of roster) {
    const raw = row.metadata?.sourceMessageIds;
    if (!Array.isArray(raw)) continue;
    for (const id of raw) {
      if (typeof id === 'string' && id.trim()) ids.add(id.trim());
    }
  }
  return [...ids];
}

/** Prefer full source-message bodies over the windowed snippet stored on the card. */
export function applySourceMessageProvenance(
  input: CharacterCardAuditInput,
  messagesById: Map<string, string>,
): CharacterCardAuditInput {
  const raw = input.metadata?.sourceMessageIds;
  if (!Array.isArray(raw) || raw.length === 0) return input;
  const bodies = [
    ...new Set(
      raw
        .filter((id): id is string => typeof id === 'string')
        .map((id) => messagesById.get(id)?.replace(/\s+/g, ' ').trim())
        .filter((text): text is string => Boolean(text)),
    ),
  ];
  if (bodies.length === 0) return input;
  return { ...input, provenanceText: bodies.join('\n\n') };
}
