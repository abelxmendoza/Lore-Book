/**
 * Ontology Action Planner — maps resolved meaning → confirm-before-CRUD chat chips.
 * Operates ONLY on MeaningResolutionResult, never raw lexical signals.
 */
import type { ChatSuggestedAction } from '../omegaChatService';
import type { MeaningResolutionResult, OntologyActionCandidate } from '../meaning/meaningResolutionTypes';

function addUnique(actions: ChatSuggestedAction[], action: ChatSuggestedAction) {
  if (!actions.some((a) => a.id === action.id)) actions.push(action);
}

function mapOntologyAction(action: OntologyActionCandidate): ChatSuggestedAction | null {
  switch (action.kind) {
    case 'set_legal_name':
      return {
        id: `set-legal-name-${String(action.payload.legalName).toLowerCase().replace(/\s+/g, '-')}`,
        label: action.label,
        kind: 'crud_confirm',
        apiMethod: 'POST',
        apiPath: '/api/characters/self/set-legal-name',
        apiBody: { legalName: action.payload.legalName },
        successMessage: `Your legal name is now "${action.payload.legalName}" on your main character profile.`,
      };
    case 'distinct_from_self': {
      const id = String(action.payload.characterId);
      return {
        id: `distinct-self-${id}`,
        label: action.label,
        kind: 'crud_confirm',
        targetId: id,
        apiMethod: 'POST',
        apiPath: `/api/characters/${id}/distinct-from-self`,
        apiBody: action.payload.relationship ? { relationship: action.payload.relationship } : {},
        successMessage: action.payload.relationship
          ? `Marked as your ${action.payload.relationship} — separate from you.`
          : 'Marked as a separate person.',
      };
    }
    case 'merge_into_self': {
      const id = String(action.payload.characterId);
      return {
        id: `merge-self-${id}`,
        label: action.label,
        kind: 'crud_confirm',
        targetId: id,
        apiMethod: 'POST',
        apiPath: `/api/characters/${id}/merge-into-self`,
        successMessage: 'Merged into your main character.',
      };
    }
    case 'add_skill':
      return {
        id: `add-skill-${String(action.payload.skillName).toLowerCase().replace(/\s+/g, '-')}`,
        label: action.label,
        kind: 'crud_confirm',
        apiMethod: 'POST',
        apiPath: '/api/skills/suggestions/materialize',
        apiBody: {
          skill_name: action.payload.skillName,
          skill_category: action.payload.hobbyOrPaid === 'paid' ? 'professional' : 'physical',
          source: 'meaning_resolution',
        },
        successMessage: `Skill "${action.payload.skillName}" queued for your profile.`,
      };
    case 'add_person':
      return {
        id: `add-person-${String(action.payload.name).toLowerCase().replace(/\s+/g, '-')}`,
        label: action.label,
        kind: 'crud_confirm',
        apiMethod: 'POST',
        apiPath: '/api/characters/suggestions/materialize',
        apiBody: { name: action.payload.name, source: 'meaning_resolution' },
        successMessage: `Person "${action.payload.name}" queued for review.`,
      };
    case 'add_place':
      return {
        id: `add-place-${String(action.payload.name).toLowerCase().replace(/\s+/g, '-')}`,
        label: action.label,
        kind: 'crud_confirm',
        apiMethod: 'POST',
        apiPath: '/api/places/suggestions/materialize',
        apiBody: action.payload,
        successMessage: `Place "${action.payload.name}" queued for review.`,
      };
    case 'add_event':
      return {
        id: `add-event-${String(action.payload.place ?? action.payload.eventKind).toLowerCase().replace(/\s+/g, '-')}`,
        label: action.label,
        kind: 'crud_confirm',
        apiMethod: 'POST',
        apiPath: '/api/events/suggestions/materialize',
        apiBody: action.payload,
        successMessage: 'Event queued for review.',
      };
    case 'review_conflict':
      return {
        id: 'review-conflict-details',
        label: action.label,
        kind: 'navigate',
        surface: 'memory-review',
      };
    case 'identify_unresolved':
      return {
        id: 'identify-unresolved-homie',
        label: action.label,
        kind: 'navigate',
        surface: 'characters',
      };
    case 'create_street_community':
      return {
        id: `create-street-community-${String(action.payload.name).toLowerCase().replace(/\s+/g, '-')}`,
        label: action.label,
        kind: 'crud_confirm',
        apiMethod: 'POST',
        apiPath: '/api/communities/suggestions/materialize',
        apiBody: action.payload,
        successMessage: 'Street community queued for review.',
      };
    case 'mark_neighbor_candidate':
      return {
        id: `neighbor-candidate-${String(action.payload.name).toLowerCase().replace(/\s+/g, '-')}`,
        label: action.label,
        kind: 'crud_confirm',
        apiMethod: 'POST',
        apiPath: '/api/relationships/suggestions/neighbor',
        apiBody: action.payload,
        successMessage: 'Neighbor candidate queued for review.',
      };
    case 'add_hobby_candidate':
      return {
        id: `hobby-candidate-${String(action.payload.name)}-${String(action.payload.hobby)}`.toLowerCase().replace(/\s+/g, '-'),
        label: action.label,
        kind: 'crud_confirm',
        apiMethod: 'POST',
        apiPath: '/api/skills/suggestions/hobby-candidate',
        apiBody: action.payload,
        successMessage: 'Hobby candidate queued for review.',
      };
    case 'add_inferred_skill':
      return {
        id: `inferred-skill-${String(action.payload.name)}-${String(action.payload.skill)}`.toLowerCase().replace(/\s+/g, '-'),
        label: action.label,
        kind: 'crud_confirm',
        apiMethod: 'POST',
        apiPath: '/api/skills/suggestions/inferred',
        apiBody: action.payload,
        successMessage: 'Inferred skill queued for review.',
      };
    case 'mark_social_contact':
      return {
        id: `social-contact-${String(action.payload.name).toLowerCase().replace(/\s+/g, '-')}`,
        label: action.label,
        kind: 'crud_confirm',
        apiMethod: 'POST',
        apiPath: '/api/relationships/suggestions/social-contact',
        apiBody: action.payload,
        successMessage: 'Social contact candidate queued for review.',
      };
    case 'create_group':
      return {
        id: `create-group-${String(action.payload.name).toLowerCase().replace(/\s+/g, '-')}`,
        label: action.label,
        kind: 'crud_confirm',
        apiMethod: 'POST',
        apiPath: '/api/groups/suggestions/materialize',
        apiBody: action.payload,
        successMessage: 'Group candidate queued for review.',
      };
    case 'associate_group':
      return {
        id: `associate-group-${String(action.payload.groupName).toLowerCase().replace(/\s+/g, '-')}`,
        label: action.label,
        kind: 'crud_confirm',
        apiMethod: 'POST',
        apiPath: '/api/groups/suggestions/associate',
        apiBody: action.payload,
        successMessage: 'Group association queued for review.',
      };
    case 'add_group_event':
      return {
        id: `group-event-${String(action.payload.title).toLowerCase().replace(/\s+/g, '-').slice(0, 40)}`,
        label: action.label,
        kind: 'crud_confirm',
        apiMethod: 'POST',
        apiPath: '/api/events/suggestions/group-meetup',
        apiBody: action.payload,
        successMessage: 'Group event queued for review.',
      };
    case 'review_club_details':
      return {
        id: 'review-club-details',
        label: action.label,
        kind: 'navigate',
        surface: 'memory-review',
      };
    case 'set_relationship':
      return {
        id: `set-rel-${String(action.payload.role)}`,
        label: action.label,
        kind: 'navigate',
        surface: 'family',
      };
    case 'resolve_duplicate': {
      const id = String(action.payload.characterId);
      return {
        id: `open-character-${id}`,
        label: action.label,
        kind: 'navigate',
        targetId: id,
        surface: 'characters',
      };
    }
    case 'navigate_surface':
      return {
        id: `open-${action.payload.surface}`,
        label: action.label,
        kind: 'navigate',
        surface: action.payload.surface as 'family' | 'characters',
      };
    case 'confirm_contradiction':
      return {
        id: `contradiction-${String(action.payload.field)}`,
        label: action.label,
        kind: 'crud_confirm',
        apiMethod: 'POST',
        apiPath: '/api/profile-claims',
        apiBody: {
          claim: `works_at:${action.payload.to}`,
          confirm: true,
        },
        successMessage: 'Employer update queued for confirmation.',
      };
    default:
      return null;
  }
}

/**
 * Build confirm-first UI actions from resolved meaning.
 * @deprecated Use buildActionsFromMeaning — message string is no longer accepted.
 */
export async function buildOntologySuggestedActions(
  userId: string,
  meaningOrMessage: MeaningResolutionResult | string,
): Promise<ChatSuggestedAction[]> {
  if (typeof meaningOrMessage === 'string') {
    // Legacy fallback — should not be used on hot path; pipeline provides meaning.
    const { meaningResolutionService } = await import('../meaning/meaningResolutionService');
    const { lexicalAnalyzerService } = await import('../lexical/lexicalAnalyzerService');
    const lexical = lexicalAnalyzerService.analyzeMessage({
      userId,
      messageId: 'legacy',
      text: meaningOrMessage,
    });
    const meaning = await meaningResolutionService.resolve({
      userId,
      messageId: 'legacy',
      text: meaningOrMessage,
      lexicalResult: lexical,
      timestamp: new Date().toISOString(),
    });
    return buildActionsFromMeaning(meaning);
  }
  return buildActionsFromMeaning(meaningOrMessage);
}

/** Map ontology action candidates → confirm-first UI chips. */
export function buildActionsFromOntologyCandidates(
  candidates: OntologyActionCandidate[]
): ChatSuggestedAction[] {
  const actions: ChatSuggestedAction[] = [];
  for (const candidate of candidates) {
    const mapped = mapOntologyAction(candidate);
    if (mapped) addUnique(actions, mapped);
  }
  return actions.slice(0, 24);
}

/** Phase 3→4: Planner receives resolved meaning (+ optional inference candidates). */
export function buildActionsFromMeaning(meaning: MeaningResolutionResult): ChatSuggestedAction[] {
  return buildActionsFromOntologyCandidates(meaning.ontologyActionCandidates);
}
