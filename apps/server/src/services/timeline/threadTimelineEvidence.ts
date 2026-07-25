import { normalizeNameKey } from '../../utils/nameNormalization';
import type { StitchedTimelineItem } from '../chronologyV2/stitchedTimelineService';
import { supabaseAdmin } from '../supabaseClient';

type ThreadMessageRow = {
  id: string;
  content: string;
  created_at: string;
};

const STOP_WORDS = new Set([
  'about', 'after', 'again', 'also', 'because', 'before', 'being', 'could',
  'from', 'have', 'into', 'just', 'more', 'that', 'their', 'them', 'then',
  'there', 'these', 'they', 'this', 'those', 'through', 'timeline', 'what',
  'when', 'where', 'which', 'with', 'would', 'your',
]);

function tokens(value: string): Set<string> {
  return new Set(
    normalizeNameKey(value)
      .split(/\s+/)
      .filter((token) => token.length >= 4 && !STOP_WORDS.has(token)),
  );
}

function sentenceParts(value: string): string[] {
  return value
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 18);
}

function isAutobiographicalStatement(value: string): boolean {
  if (!/\b(?:i|i'm|i've|my|me|we|our)\b/i.test(value)) return false;
  if (
    /\b(?:show|pull up|give|build|create|generate)\b[^.!?]{0,50}\btimeline\b/i.test(value)
  ) return false;
  return !(/^\s*(?:what|when|where|who|why|how|do|did|does|can|could|would|will|is|are)\b/i.test(value)
    && value.trim().endsWith('?'));
}

function overlapCount(left: Set<string>, right: Set<string>): number {
  let count = 0;
  for (const token of left) if (right.has(token)) count += 1;
  return count;
}

export function threadMessagesToTimelineItems(input: {
  rows: ThreadMessageRow[];
  subjectTerms: string[];
  query: string;
}): StitchedTimelineItem[] {
  const subjectKeys = input.subjectTerms.map(normalizeNameKey).filter(Boolean);
  const anchorRows = input.rows.filter((row) => {
    const content = normalizeNameKey(row.content);
    return subjectKeys.some((term) => content.includes(term));
  });
  if (anchorRows.length === 0) return [];

  const anchorVocabulary = tokens(anchorRows.map((row) => row.content).join(' '));
  const selected = input.rows.filter((row) => {
    if (anchorRows.some((anchor) => anchor.id === row.id)) return true;
    return overlapCount(tokens(row.content), anchorVocabulary) >= 2;
  });

  const items: StitchedTimelineItem[] = [];
  selected.forEach((row, rowIndex) => {
    sentenceParts(row.content)
      .filter(isAutobiographicalStatement)
      .forEach((sentence, sentenceIndex) => {
        const compact = sentence.replace(/\s+/g, ' ').trim();
        items.push({
          id: `thread:${row.id}:${sentenceIndex}`,
          kind: 'moment',
          sourceId: row.id,
          sourceIds: [row.id],
          sortTime: row.created_at,
          userSortIndex: rowIndex * 100 + sentenceIndex,
          title: compact.length <= 72 ? compact : `${compact.slice(0, 69)}…`,
          body: compact,
          sourceKind: 'timeline_event',
          sourceType: 'current_thread',
          tags: ['current-thread', 'provisional'],
          confidence: 0.72,
          timePrecision: 'sequence_only',
          timeConfidence: 0.2,
          temporalSource: 'message_sequence',
          occurrenceStatus: 'unresolved',
          projectionRole: 'evidence',
          speechAct: 'fact',
        });
      });
  });
  return items;
}

function similarity(left: StitchedTimelineItem, right: StitchedTimelineItem): number {
  const a = tokens(`${left.title} ${left.body}`);
  const b = tokens(`${right.title} ${right.body}`);
  if (a.size === 0 || b.size === 0) return 0;
  const shared = overlapCount(a, b);
  return shared / Math.min(a.size, b.size);
}

export function reconcileProvisionalTimelineItems(
  canonical: StitchedTimelineItem[],
  provisional: StitchedTimelineItem[],
): StitchedTimelineItem[] {
  const merged = canonical.map((item) => ({ ...item, sourceIds: [...item.sourceIds] }));
  for (const item of provisional) {
    const match = merged.find((candidate) => similarity(candidate, item) >= 0.72);
    if (!match) {
      merged.push(item);
      continue;
    }
    match.sourceIds = [...new Set([...match.sourceIds, item.sourceId, ...item.sourceIds])];
    match.mergedCount = Math.max(match.mergedCount ?? 1, match.sourceIds.length);
  }
  return merged;
}

export async function loadThreadTimelineEvidence(input: {
  userId: string;
  threadId?: string;
  subjectTerms: string[];
  query: string;
}): Promise<StitchedTimelineItem[]> {
  if (!input.threadId || input.subjectTerms.length === 0) return [];
  const { data, error } = await supabaseAdmin
    .from('chat_messages')
    .select('id, content, created_at')
    .eq('user_id', input.userId)
    .eq('session_id', input.threadId)
    .eq('role', 'user')
    .order('created_at', { ascending: true })
    .limit(120);
  if (error) throw error;
  return threadMessagesToTimelineItems({
    rows: (data ?? []) as ThreadMessageRow[],
    subjectTerms: input.subjectTerms,
    query: input.query,
  });
}
