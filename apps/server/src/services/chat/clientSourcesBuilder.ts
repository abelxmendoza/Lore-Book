/**
 * Builds the client-facing source list for a chat response: accepted
 * sources plus rejected evidence (e.g. closed-scope items rejected with
 * current_story_entity_mismatch), explicitly labeled 'rejected' so the
 * admin/diagnostic source export can show why something was left out
 * instead of it silently vanishing. The visible ChatSourcesBar already
 * filters usage === 'rejected' out, so this is diagnostic-only.
 */

export type ChatSourceLike = {
  type: 'entry' | 'event' | 'chapter' | 'character' | 'location' | 'task' | 'hqi' | 'fabric' | 'knowledge';
  id: string;
  title: string;
  snippet?: string;
  date?: string;
  relevanceScore?: number;
  relevanceReasons?: string[];
  usage?: 'supporting' | 'background' | 'rejected';
  rejectionReason?: string;
};

export type RejectedEvidenceItem = {
  type?: string;
  id?: string;
  title?: string;
  relevanceScore: number;
  relevanceReasons: string[];
};

export function buildClientSourcesWithRejected(
  sources: ChatSourceLike[],
  rejectedEvidence: RejectedEvidenceItem[],
  limit = 10,
): ChatSourceLike[] {
  return [
    ...sources.slice(0, limit),
    ...rejectedEvidence.slice(0, limit).map((rej) => ({
      type: (rej.type as ChatSourceLike['type']) ?? 'knowledge',
      id: rej.id ?? '',
      title: rej.title ?? '',
      relevanceScore: rej.relevanceScore,
      relevanceReasons: rej.relevanceReasons,
      usage: 'rejected' as const,
      rejectionReason: rej.relevanceReasons?.[rej.relevanceReasons.length - 1] ?? 'low_relevance',
    })),
  ];
}
