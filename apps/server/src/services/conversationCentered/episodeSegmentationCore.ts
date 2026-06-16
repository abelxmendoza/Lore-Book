/**
 * Episode Segmentation Core (Phase 3).
 *
 * Splits a thread's messages into meaningful EPISODES — the primary memory unit —
 * deterministically from signals (time gaps, entity shifts, location shifts,
 * topic shifts). Pure & testable; the thin DB wrapper + LLM titling layer calls
 * this. Positioned to consolidate sceneSegmenter / narrativeSegmenter /
 * narrativeSegmentationService (see deletion plan) rather than add a 4th.
 */

export interface SegMessage {
  id: string;
  role: string;
  content: string;
  created_at: string;
  entityIds?: string[];   // entities mentioned in this message
  locationIds?: string[]; // locations mentioned
}

export interface Episode {
  index: number;
  messageIds: string[];
  startAt: string;
  endAt: string;
  participants: string[]; // union of entityIds
  locations: string[];    // union of locationIds
  boundaryReason: string; // why this episode started
}

export interface SegmentOptions {
  timeGapMs?: number;       // gap that forces a boundary (default 6h)
  entityShiftThreshold?: number; // Jaccard below this contributes to a boundary
  boundaryThreshold?: number;    // total signal needed to split
}

const DEFAULTS = { timeGapMs: 6 * 60 * 60 * 1000, entityShiftThreshold: 0.2, boundaryThreshold: 0.6 };

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 1 : inter / union;
}

const STOP = new Set(['the', 'and', 'a', 'to', 'of', 'in', 'i', 'it', 'is', 'was', 'for', 'on', 'with', 'my', 'me', 'we', 'you', 'that', 'this', 'at', 'so', 'but']);
function topicTokens(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/[^a-záéíóúñ0-9]+/).filter((w) => w.length > 3 && !STOP.has(w)).slice(0, 30));
}

/**
 * Compute the boundary signal (0..1) between the running episode and the next
 * message. Higher = more likely a new episode starts.
 */
export function boundaryScore(
  prev: { lastAt: string; entities: Set<string>; locations: Set<string>; tokens: Set<string> },
  msg: SegMessage,
  opts: Required<SegmentOptions>
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  const gap = new Date(msg.created_at).getTime() - new Date(prev.lastAt).getTime();
  if (gap >= opts.timeGapMs) { score += 0.5; reasons.push(`time-gap(${Math.round(gap / 3_600_000)}h)`); }

  const msgEntities = new Set(msg.entityIds ?? []);
  if (prev.entities.size > 0 || msgEntities.size > 0) {
    const sim = jaccard(prev.entities, msgEntities);
    if (sim <= opts.entityShiftThreshold && msgEntities.size > 0) { score += 0.3; reasons.push('entity-shift'); }
  }

  const msgLocations = new Set(msg.locationIds ?? []);
  if (msgLocations.size > 0 && prev.locations.size > 0 && jaccard(prev.locations, msgLocations) === 0) {
    score += 0.25; reasons.push('location-shift');
  }

  const sim = jaccard(prev.tokens, topicTokens(msg.content));
  if (sim < 0.05 && prev.tokens.size > 3) { score += 0.15; reasons.push('topic-shift'); }

  return { score: Number(score.toFixed(3)), reasons };
}

/** Segment a thread's (chronological) messages into episodes. Pure. */
export function segmentEpisodes(messages: SegMessage[], options: SegmentOptions = {}): Episode[] {
  const opts = { ...DEFAULTS, ...options } as Required<SegmentOptions>;
  if (messages.length === 0) return [];

  const episodes: Episode[] = [];
  let current: SegMessage[] = [];
  let running = { lastAt: messages[0].created_at, entities: new Set<string>(), locations: new Set<string>(), tokens: new Set<string>() };
  let boundaryReason = 'thread-start';

  const flush = () => {
    if (current.length === 0) return;
    const participants = new Set<string>();
    const locations = new Set<string>();
    for (const m of current) {
      (m.entityIds ?? []).forEach((e) => participants.add(e));
      (m.locationIds ?? []).forEach((l) => locations.add(l));
    }
    episodes.push({
      index: episodes.length,
      messageIds: current.map((m) => m.id),
      startAt: current[0].created_at,
      endAt: current[current.length - 1].created_at,
      participants: [...participants],
      locations: [...locations],
      boundaryReason,
    });
  };

  for (const msg of messages) {
    if (current.length > 0) {
      const { score, reasons } = boundaryScore(running, msg, opts);
      if (score >= opts.boundaryThreshold) {
        flush();
        current = [];
        running = { lastAt: msg.created_at, entities: new Set(), locations: new Set(), tokens: new Set() };
        boundaryReason = reasons.join('+') || 'shift';
      }
    }
    current.push(msg);
    running.lastAt = msg.created_at;
    (msg.entityIds ?? []).forEach((e) => running.entities.add(e));
    (msg.locationIds ?? []).forEach((l) => running.locations.add(l));
    for (const tok of topicTokens(msg.content)) running.tokens.add(tok);
  }
  flush();
  return episodes;
}
