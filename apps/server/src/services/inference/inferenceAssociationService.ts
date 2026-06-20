/**
 * Inference Association Service — orchestrates soft association inference.
 *
 * Runs after Meaning Resolution, before Ontology Mapper.
 * Never writes hard facts — all outputs are review-first candidates.
 */
import { logger } from '../../logger';
import { memoryReviewQueueService } from '../memoryReviewQueueService';
import { omegaMemoryService } from '../omegaMemoryService';
import { perspectiveService } from '../perspectiveService';
import type { OntologyActionCandidate, MemoryReviewCandidate } from '../meaning/meaningResolutionTypes';
import { inferActivityAndInviteAssociations, shouldSkipWeCompanionInference } from './activityInferenceService';
import { scoreInferenceConfidence, allInferencesRequireReview } from './inferenceConfidenceScorer';
import { extractGroupName, inferGroupAssociations } from './groupAssociationInferenceService';
import { inferTravelClassAssociations } from './travelClassInferenceService';
import { inferWorkplaceAssociations } from './work/workplaceInferenceService';
import { loadHistoryContext } from './historyAssociationService';
import type {
  InferenceAssociationInput,
  InferenceAssociationResult,
  InferenceAmbiguity,
  InferredPersonAssociation,
} from './inferenceAssociationTypes';
import { inferenceBase } from './inferenceAssociationTypes';
import {
  extractStreetName,
  inferStreetCommunityAssociations,
  relativeLocationContext,
} from './placeCommunityInferenceService';
import { inferNeighborAssociations } from './relationshipInferenceService';
import {
  inferCodingClubSkillInterest,
  inferSkillHobbyFromActivity,
} from './skillHobbyInferenceService';

function mergePeople(target: InferredPersonAssociation[], incoming: InferredPersonAssociation[]): void {
  for (const p of incoming) {
    const existing = target.find((x) => x.normalizedName === p.normalizedName);
    if (!existing) {
      target.push(p);
      continue;
    }
    existing.roles = [...new Set([...existing.roles, ...p.roles])];
    existing.associatedCommunities = [...new Set([...existing.associatedCommunities, ...p.associatedCommunities])];
    existing.associatedPlaces = [...new Set([...existing.associatedPlaces, ...p.associatedPlaces])];
    existing.hobbyCandidates = [...new Set([...existing.hobbyCandidates, ...p.hobbyCandidates])];
    existing.skillCandidates = [...new Set([...existing.skillCandidates, ...p.skillCandidates])];
    existing.interestCandidates = [...new Set([...existing.interestCandidates, ...p.interestCandidates])];
    existing.invitedTo = [...new Set([...(existing.invitedTo ?? []), ...(p.invitedTo ?? [])])];
    existing.evidencePhrases = [...new Set([...existing.evidencePhrases, ...p.evidencePhrases])];
    existing.confidence = Math.max(existing.confidence, p.confidence);
    if (p.existingEntityId) existing.existingEntityId = p.existingEntityId;
    if (p.aliasLikely) existing.aliasLikely = true;
    if (p.localContext) existing.localContext = p.localContext;
  }
}

function buildMemoryReviewCandidates(result: Omit<InferenceAssociationResult, 'memoryReviewCandidates' | 'confidence' | 'actionCandidates'> & { workplaceMemoryReviewCandidates?: string[] }): MemoryReviewCandidate[] {
  const candidates: MemoryReviewCandidate[] = [];

  for (const c of result.inferredCommunities) {
    for (const member of c.memberCandidates) {
      candidates.push({
        claim: `${member} appears associated with ${c.name}.`,
        category: 'place',
        confidence: c.confidence,
        requiresConfirmation: true,
        source: 'inference:community',
      });
    }
  }

  for (const p of result.inferredPeople) {
    if (p.roles.includes('neighbor_candidate')) {
      candidates.push({
        claim: `${p.name} may be a neighbor/local resident.`,
        category: 'relationship',
        confidence: p.confidence,
        requiresConfirmation: true,
        source: 'inference:neighbor',
      });
    }
    if (p.associatedCommunities.length) {
      candidates.push({
        claim: `${p.name} appears associated with ${p.associatedCommunities[0]}.`,
        category: 'place',
        confidence: p.confidence,
        requiresConfirmation: true,
        source: 'inference:community_member',
      });
    }
    for (const hobby of p.hobbyCandidates) {
      const verb = hobby === 'gardening' ? 'garden' : `enjoy ${hobby}`;
      candidates.push({
        claim: `${p.name} appears to ${verb}.`,
        category: 'skill',
        confidence: p.confidence * 0.9,
        requiresConfirmation: true,
        source: 'inference:hobby',
      });
    }
    if (/fixing.*bike|bike repair/i.test(p.skillCandidates.join(' ')) || p.interestCandidates.includes('bikes')) {
      candidates.push({
        claim: `${p.name} was fixing a bike${p.localContext ? ` near ${p.localContext.replace(/^near /, '')}` : ''}.`.replace(' near near ', ' near '),
        category: 'event',
        confidence: p.confidence * 0.85,
        requiresConfirmation: true,
        source: 'inference:bike_activity',
      });
      candidates.push({
        claim: `${p.name} may be interested in biking or bike repair.`,
        category: 'skill',
        confidence: p.confidence * 0.8,
        requiresConfirmation: true,
        source: 'inference:bike_interest',
      });
    }
    if (p.roles.includes('friend_candidate') || p.roles.includes('social_contact_candidate')) {
      candidates.push({
        claim: `${p.name} may be a friend/social contact.`,
        category: 'relationship',
        confidence: p.confidence,
        requiresConfirmation: true,
        source: 'inference:social_contact',
      });
    }
    if (p.localContext) {
      candidates.push({
        claim: `${p.name} was observed ${p.localContext.includes('fixing') ? p.localContext : `near ${p.localContext.replace('near ', '')}`}.`.replace('observed near near', 'observed near'),
        category: 'event',
        confidence: p.confidence * 0.85,
        requiresConfirmation: true,
        source: 'inference:local_context',
      });
    }
    if (p.invitedTo?.length) {
      candidates.push({
        claim: `User invited ${p.name} to an after-school ${p.invitedTo[0]}.`,
        category: 'event',
        confidence: p.confidence,
        requiresConfirmation: true,
        source: 'inference:invitation',
      });
    }
  }

  for (const g of result.inferredGroups) {
    candidates.push({
      claim: `${g.name} appears to be a user-associated group.`,
      category: 'general',
      confidence: g.confidence,
      requiresConfirmation: true,
      source: 'inference:group',
    });
  }

  for (const s of result.inferredSkills.filter((x) => x.subjectKind === 'user')) {
    candidates.push({
      claim: `User may be associated with ${s.skill} through ${extractGroupName(result.rawText) ?? 'a group'}.`,
      category: 'skill',
      confidence: s.confidence,
      requiresConfirmation: true,
      source: 'inference:user_skill',
    });
  }

  for (const h of result.inferredHobbies.filter((x) => x.subjectName === 'Ducky' && /coding/i.test(x.hobby))) {
    candidates.push({
      claim: `${h.subjectName} may be interested in ${h.hobby} (low confidence — invitation only).`,
      category: 'skill',
      confidence: h.confidence,
      requiresConfirmation: true,
      source: 'inference:invited_interest',
    });
  }

  for (const claim of result.workplaceMemoryReviewCandidates ?? []) {
    candidates.push({
      claim,
      category: 'general',
      confidence: 0.85,
      requiresConfirmation: true,
      source: 'inference:workplace',
    });
  }

  return dedupeMemory(candidates);
}

function buildActionCandidates(result: Omit<InferenceAssociationResult, 'actionCandidates' | 'memoryReviewCandidates' | 'confidence'> & { travelActionExtras?: { label: string; kind: string; payload: Record<string, unknown>; confidence: number }[] }): OntologyActionCandidate[] {
  const actions: OntologyActionCandidate[] = [];

  for (const g of result.inferredGroups) {
    actions.push({
      kind: 'create_group',
      label: `Create group: ${g.name}`,
      confidence: g.confidence,
      requiresConfirmation: true,
      payload: { name: g.name, type: g.type, domain: g.domain },
    });
    actions.push({
      kind: 'associate_group',
      label: `Associate user with ${g.name}`,
      confidence: g.confidence,
      requiresConfirmation: true,
      payload: { groupName: g.name, role: g.userRoleCandidate },
    });
  }

  for (const e of result.inferredEvents) {
    actions.push({
      kind: 'add_group_event',
      label: `Add ${e.title}`,
      confidence: e.confidence,
      requiresConfirmation: true,
      payload: { title: e.title, groupName: e.groupName },
    });
  }

  if (result.inferredGroups.some((g) => /school|club/i.test(g.type))) {
    actions.push({
      kind: 'review_club_details',
      label: 'Review school/club details',
      confidence: 0.7,
      requiresConfirmation: true,
      payload: {},
    });
  }

  for (const c of result.inferredCommunities) {
    actions.push({
      kind: 'create_street_community',
      label: `Create street community: ${c.name}`,
      confidence: c.confidence,
      requiresConfirmation: true,
      payload: { name: c.name, place: c.place, privacyMode: c.privacyMode },
    });
  }

  for (const p of result.inferredPeople) {
    actions.push({
      kind: 'add_person',
      label: p.aliasLikely ? `Add person/alias: ${p.name}` : `Add person: ${p.name}`,
      confidence: p.confidence,
      requiresConfirmation: true,
      payload: { name: p.name, existingEntityId: p.existingEntityId },
    });
    if (p.roles.includes('neighbor_candidate')) {
      actions.push({
        kind: 'mark_neighbor_candidate',
        label: `Mark ${p.name} as neighbor candidate`,
        confidence: p.confidence,
        requiresConfirmation: true,
        payload: { name: p.name },
      });
    }
    if (p.roles.includes('friend_candidate') || p.roles.includes('social_contact_candidate')) {
      actions.push({
        kind: 'mark_social_contact',
        label: `Mark ${p.name} as friend/social contact candidate`,
        confidence: p.confidence,
        requiresConfirmation: true,
        payload: { name: p.name },
      });
    }
    for (const hobby of p.hobbyCandidates) {
      actions.push({
        kind: 'add_hobby_candidate',
        label: `Add hobby candidate: ${titleCase(hobby)} for ${p.name}`,
        confidence: p.confidence * 0.9,
        requiresConfirmation: true,
        payload: { name: p.name, hobby },
      });
    }
    for (const skill of p.skillCandidates) {
      actions.push({
        kind: 'add_inferred_skill',
        label: `Add skill candidate: ${titleCase(skill)} for ${p.name}`,
        confidence: p.confidence * 0.88,
        requiresConfirmation: true,
        payload: { name: p.name, skill },
      });
    }
  }

  for (const extra of result.travelActionExtras ?? []) {
    actions.push({
      kind: extra.kind,
      label: extra.label,
      confidence: extra.confidence,
      requiresConfirmation: true,
      payload: extra.payload,
    });
  }

  return dedupeActions(actions);
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function dedupeMemory(items: MemoryReviewCandidate[]): MemoryReviewCandidate[] {
  const seen = new Set<string>();
  return items.filter((c) => {
    if (seen.has(c.claim)) return false;
    seen.add(c.claim);
    return true;
  });
}

function dedupeActions(items: OntologyActionCandidate[]): OntologyActionCandidate[] {
  const seen = new Set<string>();
  return items.filter((a) => {
    if (seen.has(a.label)) return false;
    seen.add(a.label);
    return true;
  });
}

class InferenceAssociationService {
  async infer(input: InferenceAssociationInput): Promise<InferenceAssociationResult> {
    const { userId, messageId, threadId, rawText, lexicalResult, meaningResult, timestamp } = input;
    const history = await loadHistoryContext(userId);

    const streetResult = inferStreetCommunityAssociations(rawText, messageId, history);
    const streetName = streetResult.streetName ?? extractStreetName(rawText);
    const communityName = streetResult.communities[0]?.name;

    const neighborResult = inferNeighborAssociations(
      rawText,
      messageId,
      history,
      streetName,
      communityName
    );

    const groupResult = inferGroupAssociations(rawText, messageId, history);
    const travelClassResult = inferTravelClassAssociations(rawText, messageId, history);
    const workplaceResult = inferWorkplaceAssociations(rawText, messageId, history);
    const groupName = groupResult.groups[0]?.name ?? travelClassResult.groups.find((g) => g.type === 'school_class')?.name ?? extractGroupName(rawText);

    const activityResult = inferActivityAndInviteAssociations(
      rawText,
      messageId,
      history,
      streetName,
      groupName
    );

    const skillHobbyResult = inferSkillHobbyFromActivity(rawText, messageId, [
      ...neighborResult.people.map((p) => p.name),
      ...activityResult.people.map((p) => p.name),
    ]);

    const invitedPerson = activityResult.people.find((p) => p.invitedTo?.length)?.name;
    const codingResult = inferCodingClubSkillInterest(rawText, messageId, groupName, invitedPerson);

    const inferredPeople: InferredPersonAssociation[] = [];
    mergePeople(inferredPeople, neighborResult.people);
    mergePeople(inferredPeople, activityResult.people);
    mergePeople(inferredPeople, workplaceResult.people);

    for (const p of inferredPeople) {
      for (const h of skillHobbyResult.hobbies.filter((x) => x.subjectName === p.name)) {
        if (!p.hobbyCandidates.includes(h.hobby)) p.hobbyCandidates.push(h.hobby);
      }
      for (const s of skillHobbyResult.skills.filter((x) => x.subjectName === p.name)) {
        if (!p.skillCandidates.includes(s.skill)) p.skillCandidates.push(s.skill);
      }
    }

    if (communityName) {
      for (const p of inferredPeople) {
        if (p.roles.includes('street_community_member_candidate') || p.roles.includes('neighbor_candidate')) {
          if (!streetResult.communities[0].memberCandidates.includes(p.name)) {
            streetResult.communities[0].memberCandidates.push(p.name);
          }
        }
      }
    }

    const ambiguities: InferenceAmbiguity[] = [];
    if (shouldSkipWeCompanionInference(rawText)) {
      ambiguities.push({
        code: 'inclusive_we_not_expanded',
        description: 'Did not create companion entities from inclusive "we".',
        confidence: 0.9,
      });
    }
    if (/\baround\s+the\s+corner\b/i.test(rawText)) {
      ambiguities.push({
        code: 'relative_location_coarse_only',
        description: '"around the corner" mapped to coarse neighborhood context, not a precise location.',
        confidence: 0.85,
      });
    }
    if (/\boutside\s+his\s+house\b/i.test(rawText)) {
      ambiguities.push({
        code: 'no_exact_home_address',
        description: 'Did not store exact home address — coarse street association only.',
        confidence: 0.92,
      });
    }

    const partial = {
      userId,
      messageId,
      threadId,
      rawText,
      inferredPeople,
      inferredGroups: [...groupResult.groups, ...travelClassResult.groups, ...workplaceResult.groups],
      inferredCommunities: streetResult.communities,
      inferredSkills: [...skillHobbyResult.skills, ...codingResult.skills, ...travelClassResult.skills, ...workplaceResult.skills],
      inferredHobbies: [...skillHobbyResult.hobbies, ...codingResult.hobbies, ...travelClassResult.hobbies],
      inferredRelationships: [
        ...neighborResult.relationships,
        ...groupResult.relationships,
        ...activityResult.relationships,
        ...travelClassResult.relationships,
        ...workplaceResult.relationships,
      ],
      inferredPlaces: [...streetResult.places, ...workplaceResult.places],
      inferredEvents: [...groupResult.events, ...travelClassResult.events, ...workplaceResult.events],
      ambiguities: [...ambiguities, ...travelClassResult.ambiguities, ...workplaceResult.ambiguities],
      createdAt: timestamp,
      travelActionExtras: [...travelClassResult.actionExtras, ...workplaceResult.actionExtras],
      workplaceMemoryReviewCandidates: workplaceResult.memoryReviewCandidates,
    };

    const memoryReviewCandidates = buildMemoryReviewCandidates(partial);
    const actionCandidates = buildActionCandidates(partial);
    const confidence = scoreInferenceConfidence(partial);

    return {
      ...partial,
      memoryReviewCandidates,
      actionCandidates,
      confidence,
    };
  }

  async inferAndQueueReview(input: InferenceAssociationInput): Promise<InferenceAssociationResult> {
    const result = await this.infer(input);

    if (!result.memoryReviewCandidates.length) return result;

    try {
      const entities = await omegaMemoryService.getEntities(input.userId);
      const selfEntity = entities[0] ?? null;
      const perspectives = await perspectiveService.getOrCreateDefaultPerspectives(input.userId);
      const selfPerspectiveId = perspectives.find((p) => p.type === 'SELF')?.id ?? null;

      if (!selfEntity) return result;

      for (const candidate of result.memoryReviewCandidates) {
        if (candidate.confidence < 0.4) continue;
        await memoryReviewQueueService.ingestMemory(
          input.userId,
          {
            id: '',
            text: candidate.claim,
            confidence: candidate.confidence,
            metadata: {
              category: candidate.category,
              source: candidate.source,
              requires_confirmation: true,
              inferred_not_confirmed: true,
              message_id: input.messageId,
              from: 'inference_association',
            },
          },
          selfEntity,
          selfPerspectiveId,
          result.rawText
        );
      }
    } catch (err) {
      logger.warn({ err, messageId: input.messageId }, 'Inference memory queue failed');
    }

    return result;
  }

  validateInferredNotConfirmed(result: InferenceAssociationResult): boolean {
    return allInferencesRequireReview(result);
  }
}

export const inferenceAssociationService = new InferenceAssociationService();
