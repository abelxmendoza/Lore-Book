import { logger } from '../../../logger';
import { tracedCompletion } from '../../../lib/openai';
import { supabaseAdmin } from '../../supabaseClient';
import { arcService, type ArcType } from './arcService';
import { arcMembershipService, type MembershipRole } from './arcMembershipService';
import { arcRelationshipService } from './arcRelationshipService';

// ─── Types ────────────────────────────────────────────────────────────────────

type RawCandidate = {
  id: string;
  canonical_title: string;
  dominant_entity_names: string[];
  recurring_activities: string[];
  occurrence_count: number;
  continuity_strength: number;
  first_seen_at: string | null;
  last_seen_at: string | null;
};

type CandidateCluster = {
  candidates: RawCandidate[];
  arc_type: ArcType;
  track: TrackType;
  dominant_emotion: string | null;
  earliest: Date;
  latest: Date;
};

// ─── Heuristics ───────────────────────────────────────────────────────────────

const SKILL_ACTIVITIES = new Set([
  'coding', 'code', 'programming', 'debugging', 'building', 'designing',
  'studying', 'reading', 'learning', 'practicing', 'training', 'writing',
  'photography', 'drawing', 'painting', 'music', 'playing', 'recording',
]);

const WORK_ACTIVITIES = new Set([
  'working', 'meeting', 'presenting', 'pitching', 'interviewing', 'hiring',
  'managing', 'reviewing', 'deploying', 'shipping', 'launching',
]);

const RELATIONSHIP_ENTITIES = new Set([
  'girlfriend', 'boyfriend', 'wife', 'husband', 'partner', 'date',
  'friend', 'best friend', 'family', 'mom', 'dad', 'sister', 'brother',
]);

const HEALTH_ACTIVITIES = new Set([
  'gym', 'running', 'exercising', 'workout', 'training', 'fighting',
  'boxing', 'mma', 'yoga', 'meditating', 'therapy', 'doctor', 'hospital',
]);

type TrackType = 'career' | 'relationships' | 'creative' | 'health' | 'inner' | 'mixed';

// Max days between two candidates' date ranges to be considered the same cluster
const CLUSTER_GAP_DAYS = 180;

function inferArcType(candidate: RawCandidate): ArcType {
  const activities = candidate.recurring_activities.map(a => a.toLowerCase());
  const hasSkill = activities.some(a => SKILL_ACTIVITIES.has(a));
  const hasWork = activities.some(a => WORK_ACTIVITIES.has(a));

  const names = candidate.dominant_entity_names.map(n => n.toLowerCase());
  const looksLikeLocation = names.some(n =>
    /\b(city|street|avenue|park|university|college|campus|building|district|neighborhood|country|state)\b/.test(n)
  );

  if (looksLikeLocation) return 'location';
  if (hasWork) return 'work';
  if (hasSkill) return 'skill';
  return 'life_era';
}

/**
 * Maps arc_type + activity signals to a parallel track label.
 * Track is the *thematic lane* a life arc belongs to, orthogonal to arc_type.
 */
function inferTrack(candidate: RawCandidate, arcType: ArcType): TrackType {
  const activities = new Set(candidate.recurring_activities.map(a => a.toLowerCase()));
  const names = candidate.dominant_entity_names.map(n => n.toLowerCase()).join(' ');

  if (arcType === 'work') return 'career';
  if (arcType === 'skill') {
    // Creative skills vs. analytical skills
    const isCreative = ['photography', 'drawing', 'painting', 'music', 'recording', 'writing']
      .some(a => activities.has(a));
    return isCreative ? 'creative' : 'career';
  }
  if (arcType === 'location') return 'inner';

  // life_era / custom: pick the strongest single domain (never dump everything into mixed).
  const scores: Record<TrackType, number> = {
    health: [...HEALTH_ACTIVITIES].some(a => activities.has(a)) ? 1 : 0,
    relationships: [...RELATIONSHIP_ENTITIES].some(r => names.includes(r)) ? 1 : 0,
    creative: ['writing', 'music', 'photography', 'drawing', 'painting'].some(a => activities.has(a)) ? 1 : 0,
    career: [...WORK_ACTIVITIES].some(a => activities.has(a)) ? 1 : 0,
    inner: 0,
    mixed: 0,
  };

  const ranked: TrackType[] = ['relationships', 'career', 'health', 'creative'];
  let best: TrackType = 'inner';
  let bestScore = 0;
  for (const track of ranked) {
    if (scores[track] > bestScore) {
      bestScore = scores[track];
      best = track;
    }
  }
  return bestScore > 0 ? best : 'inner';
}

/**
 * Dominant emotion: most frequent emotional_tone across cluster candidates.
 * Falls back to 'neutral' when no emotional signal exists.
 */
function inferDominantEmotion(candidates: RawCandidate[]): string | null {
  const freq: Record<string, number> = {};
  for (const c of candidates) {
    const tone = (c as any).emotional_tone as string | undefined;
    if (tone) freq[tone] = (freq[tone] ?? 0) + c.occurrence_count;
  }
  const entries = Object.entries(freq);
  if (entries.length === 0) return null;
  return entries.reduce((best, cur) => (cur[1] > best[1] ? cur : best))[0];
}

function candidateDate(c: RawCandidate): Date | null {
  const d = c.first_seen_at ?? c.last_seen_at;
  return d ? new Date(d) : null;
}

// ─── Clustering ───────────────────────────────────────────────────────────────

function clusterCandidates(candidates: RawCandidate[]): CandidateCluster[] {
  // Sort by first_seen_at ascending
  const sorted = [...candidates].sort((a, b) => {
    const da = candidateDate(a)?.getTime() ?? 0;
    const db = candidateDate(b)?.getTime() ?? 0;
    return da - db;
  });

  const clusters: CandidateCluster[] = [];

  for (const candidate of sorted) {
    const date = candidateDate(candidate);
    if (!date) continue;

    const arcType = inferArcType(candidate);

    // Find an existing cluster to merge into.
    // Rules:
    //   1. Same arc_type and within the temporal gap window.
    //   2. Must share at least one entity name — events involving completely different
    //      people/places belong to separate arcs even when temporally close.
    //      (E.g., two concurrent jobs, two overlapping relationships → separate arcs.)
    //   3. Exception: if neither the candidate nor the cluster has named entities,
    //      fall back to proximity-only (generic life_era events).
    const candidateNames = new Set(candidate.dominant_entity_names.map(n => n.toLowerCase()));
    const match = clusters.find(cl => {
      if (cl.arc_type !== arcType) return false;
      const gapDays = (date.getTime() - cl.latest.getTime()) / (1000 * 60 * 60 * 24);
      if (gapDays > CLUSTER_GAP_DAYS || gapDays < -CLUSTER_GAP_DAYS) return false;

      // Entity-overlap check — separates concurrent but distinct arcs
      if (candidateNames.size > 0) {
        const clusterNames = cl.candidates.flatMap(c =>
          c.dominant_entity_names.map(n => n.toLowerCase())
        );
        const clusterHasNames = clusterNames.length > 0;
        const hasSharedEntity = clusterNames.some(n => candidateNames.has(n));
        if (clusterHasNames && !hasSharedEntity) return false; // different context → separate arc
      }

      return true;
    });

    if (match) {
      match.candidates.push(candidate);
      if (date < match.earliest) match.earliest = date;
      if (date > match.latest) match.latest = date;
    } else {
      clusters.push({
        candidates: [candidate],
        arc_type: arcType,
        track: inferTrack(candidate, arcType),
        dominant_emotion: null, // populated after all candidates are assigned
        earliest: date,
        latest: new Date(Math.max(date.getTime(), new Date(candidate.last_seen_at ?? date).getTime())),
      });
    }
  }

  // Populate track + dominant_emotion now that each cluster has all its candidates
  for (const cl of clusters) {
    cl.track = inferTrack(cl.candidates[0], cl.arc_type);
    cl.dominant_emotion = inferDominantEmotion(cl.candidates);
  }

  // Require at least 2 candidates or high continuity to form an arc
  return clusters.filter(cl =>
    cl.candidates.length >= 2 ||
    cl.candidates.some(c => c.continuity_strength >= 0.55)
  );
}

// ─── AI titling ───────────────────────────────────────────────────────────────

interface ArcProposal {
  title: string;
  summary: string | null;
  is_active: boolean;
  confidence: number;
}

async function proposeArcTitle(
  cluster: CandidateCluster,
  userId: string
): Promise<ArcProposal> {
  const sceneList = cluster.candidates
    .slice(0, 8)
    .map(c => `- "${c.canonical_title}" (${c.occurrence_count}× occurrences, strength ${c.continuity_strength.toFixed(2)})`)
    .join('\n');

  const startStr = cluster.earliest.toISOString().slice(0, 10);
  const endStr = cluster.candidates.some(c => !c.last_seen_at)
    ? 'ongoing'
    : cluster.latest.toISOString().slice(0, 10);

  const prompt = `You are analyzing autobiographical journal data to name and summarize a life arc.

Arc type: ${cluster.arc_type}
Date range: ${startStr} to ${endStr}
Recurring scenes in this period:
${sceneList}

Respond with a JSON object only, no other text:
{
  "title": "<2-5 word evocative name for this life period, e.g. 'The Austin Years' or 'Learning to Code'>",
  "summary": "<1-2 sentence narrative description of what this period represents in the person's life>",
  "is_active": <true if end date is recent (within 6 months) or ongoing, false otherwise>,
  "confidence": <0.5–0.95, how confident you are this is a real distinct life arc>
}`;

  try {
    const completion = await tracedCompletion(
      {
        model: 'gpt-5.4-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        max_tokens: 200,
        temperature: 0.3,
      },
      { service: 'arcInference', userId }
    );

    const text = completion.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(text) as ArcProposal;

    return {
      title: parsed.title || `${cluster.arc_type} arc (${startStr})`,
      summary: parsed.summary || null,
      is_active: parsed.is_active ?? false,
      confidence: Math.min(0.95, Math.max(0.4, parsed.confidence ?? 0.6)),
    };
  } catch (err) {
    logger.warn({ err, userId }, 'arcInference: AI titling failed, using fallback');
    const topTitle = cluster.candidates[0].canonical_title;
    return {
      title: topTitle.slice(0, 60),
      summary: null,
      is_active: false,
      confidence: 0.5,
    };
  }
}

// ─── Importance scoring ───────────────────────────────────────────────────────

function scoreImportance(candidate: RawCandidate): { score: number; role: MembershipRole | null } {
  const s = candidate.continuity_strength;
  if (s >= 0.85) return { score: 0.9, role: 'defining_moment' };
  if (s >= 0.72) return { score: 0.75, role: 'turning_point' };
  if (s >= 0.50) return { score: 0.55, role: 'background' };
  return { score: 0.35, role: 'transition' };
}

// ─── Main inference service ───────────────────────────────────────────────────

export class ArcInferenceService {
  async runForUser(userId: string): Promise<void> {
    logger.info({ userId }, 'arcInference: starting');

    // 1. Load event_candidates — use timeline_candidate=true (≥ 0.60 strength) or any with 2+ occurrences
    const { data: rows, error } = await supabaseAdmin
      .from('event_candidates')
      .select('id, canonical_title, dominant_entity_names, recurring_activities, occurrence_count, continuity_strength, first_seen_at, last_seen_at')
      .eq('user_id', userId)
      .or('timeline_candidate.eq.true,occurrence_count.gte.2');

    if (error) {
      logger.error({ error, userId }, 'arcInference: failed to load event_candidates');
      return;
    }

    const candidates: RawCandidate[] = rows ?? [];
    if (candidates.length === 0) {
      logger.info({ userId }, 'arcInference: no eligible candidates, skipping');
      return;
    }

    logger.debug({ userId, count: candidates.length }, 'arcInference: candidates loaded');

    // 2. Cluster by arc type + temporal proximity
    const clusters = clusterCandidates(candidates);
    logger.debug({ userId, clusters: clusters.length }, 'arcInference: clusters formed');

    if (clusters.length === 0) return;

    // 3. For each cluster: title via AI, upsert arc, set memberships
    const arcIds: string[] = [];

    for (const cluster of clusters) {
      try {
        const proposal = await proposeArcTitle(cluster, userId);

        const arc = await arcService.upsert(userId, {
          title: proposal.title,
          arc_type: cluster.arc_type,
          track: cluster.track,
          dominant_emotion: cluster.dominant_emotion,
          start_date: cluster.earliest.toISOString().slice(0, 10),
          end_date: cluster.candidates.every(c => c.last_seen_at)
            ? cluster.latest.toISOString().slice(0, 10)
            : null,
          is_active: proposal.is_active,
          summary: proposal.summary,
          confidence: proposal.confidence,
          source: 'inferred',
        });

        arcIds.push(arc.id);

        // 4. Set weighted memberships
        const memberships = cluster.candidates.map(c => {
          const { score, role } = scoreImportance(c);
          return {
            arc_id: arc.id,
            event_candidate_id: c.id,
            importance_score: score,
            role,
          };
        });

        await arcMembershipService.setMany(userId, memberships);

        logger.debug({ userId, arcId: arc.id, title: arc.title, members: memberships.length }, 'arcInference: arc upserted');
      } catch (err) {
        logger.warn({ err, userId, clusterType: cluster.arc_type }, 'arcInference: cluster failed, continuing');
      }
    }

    // 5. Infer relationships between the newly upserted arcs
    if (arcIds.length >= 2) {
      const arcs = await arcService.listForUser(userId, { min_confidence: 0.4 });
      const newArcs = arcs.filter(a => arcIds.includes(a.id));
      const relationshipPayloads = arcRelationshipService.inferFromArcs(newArcs);

      if (relationshipPayloads.length > 0) {
        await arcRelationshipService.upsertMany(userId, relationshipPayloads);
        logger.debug({ userId, relationships: relationshipPayloads.length }, 'arcInference: relationships inferred');
      }
    }

    logger.info({ userId, arcs: arcIds.length }, 'arcInference: complete');
  }
}

export const arcInferenceService = new ArcInferenceService();
