import { logger } from '../../logger';
import { eventInferenceService } from '../events/inference/eventInferenceService';
import { relationshipInferenceService } from '../relationships/inference/relationshipInferenceService';
import { skillInferenceService } from '../skills/inference/skillInferenceService';
import {
  loadTimelineAnchorsForUser,
  persistTimelineAnchors,
  queueTimelineContradictionReviews,
} from './timelineStitchingPersistenceService';
import { stitchTimelineFromMessage } from './timelineStitchingService';
import { persistTemporalRelations } from './temporalRelationPersistenceService';
import { persistNarrativeRelations } from './narrativeRelationPersistenceService';
import type { StitchAttachmentTarget, TimelineStitchingResult } from './timelineStitchingTypes';

export type TimelineStitchingRunSummary = {
  anchorsCreated: number;
  rejectedStandalone: number;
  contradictionsQueued: number;
  stitchLinks: number;
  temporalRelations: number;
  narrativeRelations: number;
  canonicalReused: number;
  sourceThreadsSeen: number;
};

function buildInferenceAttachmentCandidates(
  text: string,
  sourceMessageId: string,
): StitchAttachmentTarget[] {
  const targets: StitchAttachmentTarget[] = [];
  const inferInput = { text, sourceMessageId, authorRole: 'user' as const };

  const events = eventInferenceService.inferFromMessage(inferInput);
  for (const event of events.accepted) {
    targets.push({
      attachedToType: 'event',
      attachedToLabel: event.displayName,
      confidence: event.confidence,
    });
  }

  const skills = skillInferenceService.inferFromMessage(inferInput);
  for (const skill of skills.accepted) {
    targets.push({
      attachedToType: 'skill',
      attachedToLabel: skill.displayName,
      confidence: skill.confidence,
    });
  }

  const relationships = relationshipInferenceService.inferFromMessage(inferInput);
  for (const rel of relationships.accepted) {
    const label = rel.object.displayName || rel.subject.displayName;
    if (!label) continue;
    targets.push({
      attachedToType: rel.temporalStatus === 'past' ? 'relationship_arc' : 'relationship',
      attachedToLabel: label,
      confidence: rel.confidence,
    });
  }

  return targets;
}

export async function runTimelineStitchingForMessage(
  userId: string,
  text: string,
  sourceMessageId: string,
  messageTimestamp?: string,
  sourceThreadId?: string,
  knowledgeTimestamp?: string,
): Promise<TimelineStitchingRunSummary> {
  if (!text.trim() || text.trim().length < 8) {
    return { anchorsCreated: 0, rejectedStandalone: 0, contradictionsQueued: 0, stitchLinks: 0, temporalRelations: 0, narrativeRelations: 0, canonicalReused: 0, sourceThreadsSeen: 0 };
  }

  try {
    const existing = await loadTimelineAnchorsForUser(userId);
    const attachmentCandidates = buildInferenceAttachmentCandidates(text, sourceMessageId);

    const result: TimelineStitchingResult = stitchTimelineFromMessage(
      {
        text,
        sourceMessageId,
        userId,
        messageTimestamp,
        sourceThreadId,
        knowledgeTimestamp,
        attachmentCandidates,
      },
      existing.map((a) => ({
        id: a.id,
        phrase: a.phrase,
        attachedToLabel: a.attachedToLabel,
        attachedToType: a.attachedToType,
        normalizedTime: a.normalizedTime,
      })),
    );

    const anchorsCreated = await persistTimelineAnchors(userId, result.anchors);
    const temporalPersistence = await persistTemporalRelations(userId, result.temporalRelations);
    const narrativePersistence = await persistNarrativeRelations(userId, result.narrativeRelations);
    const temporalRelations = temporalPersistence.written;
    const narrativeRelations = narrativePersistence.written;
    const canonicalReused = temporalPersistence.reused + narrativePersistence.reused;
    const sourceThreadsSeen = Math.max(temporalPersistence.sourceThreadsSeen, narrativePersistence.sourceThreadsSeen);
    const contradictionsQueued = await queueTimelineContradictionReviews(
      userId,
      result.contradictions,
      sourceMessageId,
    );

    if (anchorsCreated > 0 || contradictionsQueued > 0) {
      logger.debug(
        {
          userId,
          sourceMessageId,
          anchorsCreated,
          rejectedStandalone: result.rejectedStandaloneTime.length,
          contradictionsQueued,
          stitchLinks: result.stitchLinks.length,
          temporalRelations,
          narrativeRelations,
          canonicalReused,
          sourceThreadsSeen,
        },
        'Timeline stitching applied',
      );
    }

    return {
      anchorsCreated,
      rejectedStandalone: result.rejectedStandaloneTime.length,
      contradictionsQueued,
      stitchLinks: result.stitchLinks.length,
      temporalRelations,
      narrativeRelations,
      canonicalReused,
      sourceThreadsSeen,
    };
  } catch (err) {
    logger.warn({ err, userId, sourceMessageId }, 'Timeline stitching failed (non-blocking)');
    return { anchorsCreated: 0, rejectedStandalone: 0, contradictionsQueued: 0, stitchLinks: 0, temporalRelations: 0, narrativeRelations: 0, canonicalReused: 0, sourceThreadsSeen: 0 };
  }
}

export async function rescanTimelineStitching(
  userId: string,
  episodes: Array<{ id: string; text: string; at: string }>,
): Promise<TimelineStitchingRunSummary> {
  let anchorsCreated = 0;
  let rejectedStandalone = 0;
  let contradictionsQueued = 0;
  let stitchLinks = 0;
  let temporalRelations = 0;
  let narrativeRelations = 0;
  let canonicalReused = 0;
  let sourceThreadsSeen = 0;

  for (const episode of episodes) {
    const summary = await runTimelineStitchingForMessage(
      userId,
      episode.text,
      episode.id,
      episode.at,
    );
    anchorsCreated += summary.anchorsCreated;
    rejectedStandalone += summary.rejectedStandalone;
    contradictionsQueued += summary.contradictionsQueued;
    stitchLinks += summary.stitchLinks;
    temporalRelations += summary.temporalRelations;
    narrativeRelations += summary.narrativeRelations;
    canonicalReused += summary.canonicalReused;
    sourceThreadsSeen += summary.sourceThreadsSeen;
  }

  return { anchorsCreated, rejectedStandalone, contradictionsQueued, stitchLinks, temporalRelations, narrativeRelations, canonicalReused, sourceThreadsSeen };
}
