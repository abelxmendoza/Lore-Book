import { normalizeNameKey } from './nameNormalization';

export function collectNameKeys(
  primary: string,
  normalized: string | null | undefined,
  aliases: string[]
): Set<string> {
  return new Set([primary, normalized ?? '', ...aliases].map(normalizeNameKey).filter(Boolean));
}

export function textMentionsOnlySource(
  text: string,
  sourceKeys: Set<string>,
  survivorKeys: Set<string>
): boolean {
  const norm = normalizeNameKey(text);
  if (!norm) return false;
  const mentionsSource = [...sourceKeys].some((key) => key.length >= 3 && norm.includes(key));
  const mentionsSurvivor = [...survivorKeys].some((key) => key.length >= 2 && norm.includes(key));
  return mentionsSource && !mentionsSurvivor;
}

export function flagMergedTextSnippets(
  texts: Array<string | null | undefined>,
  sourceKeys: Set<string>,
  survivorKeys: Set<string>,
  max = 8
): string[] {
  const reviewFlags: string[] = [];
  for (const chunk of texts.filter(Boolean) as string[]) {
    for (const sentence of chunk.split(/(?<=[.!?])\s+/)) {
      if (textMentionsOnlySource(sentence, sourceKeys, survivorKeys)) {
        reviewFlags.push(sentence.trim().slice(0, 180));
        if (reviewFlags.length >= max) return reviewFlags;
      }
    }
  }
  return reviewFlags;
}

export function withMergeReviewMetadata(
  metadata: Record<string, unknown>,
  snippets: string[],
  note = 'Some merged text may refer only to the absorbed name — review on the card.'
): Record<string, unknown> {
  if (snippets.length === 0) return metadata;
  return {
    ...metadata,
    merge_review: {
      flagged_at: new Date().toISOString(),
      snippets: snippets.slice(0, 8),
      note,
    },
  };
}
