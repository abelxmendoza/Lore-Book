/**
 * Mode Handlers
 * 
 * Handlers for each of the 5 chat modes.
 * Each handler knows exactly what to do for its mode.
 */

import { JOURNAL_COLS } from '../../db/journalEntryColumns';
import { logger } from '../../logger';
import { evaluateSentenceBleed } from '../characters/audit/characterIdentityGate';
import type { StreamingChatResponse } from '../omegaChatService';
import {
  INGESTION_ACK_FALLBACK,
  INGESTION_ACK_GUIDANCE,
  LIFE_UPDATE_REFLECTION_GUIDANCE,
  isMultiTransitionLifeUpdate,
} from '../chat/verifiedMemoryLanguage';
import { supabaseAdmin } from '../supabaseClient';

import type { ChatMode } from './modeRouterService';

export interface ModeHandlerResponse {
  content: string;
  response_mode: string;
  confidence?: number;
  metadata?: Record<string, unknown>;
}

class ModeHandlers {
  /**
   * Handle message based on mode
   */
  async handleMode(
    mode: ChatMode,
    userId: string,
    message: string,
    options?: {
      messageId?: string;
      conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
      continuityContext?: string;
      threadId?: string;
      focusCharacterId?: string;
      focusCharacterName?: string;
    }
  ): Promise<ModeHandlerResponse> {
    switch (mode) {
      case 'EMOTIONAL_EXISTENTIAL':
        return await this.handleEmotionalExistential(userId, message);
      
      case 'MEMORY_RECALL':
        return await this.handleMemoryRecall(userId, message, options?.conversationHistory, options?.threadId);
      
      case 'NARRATIVE_RECALL':
        return await this.handleNarrativeRecall(userId, message);

      case 'NARRATIVE_STORY':
        return await this.handleNarrativeStory(userId, message);

      case 'FOUNDATION_RECALL':
        return await this.handleFoundationRecall(userId, message, options?.conversationHistory, options?.threadId);

      case 'SUBJECT_TIMELINE':
        return await this.handleSubjectTimeline(userId, message, options?.threadId, options?.messageId);

      case 'CURRENT_STORY_CAST':
        return await this.handleCurrentStoryCast(userId, message, options?.threadId);

      case 'CHARACTER_BOOK_WRITE':
        return await this.handleCharacterBookWrite(userId, message, options?.threadId);

      case 'ORGANIZATION_GROUP_WRITE':
        return await this.handleOrganizationGroupWrite(userId, message, options);

      case 'ENTITY_RECLASSIFY_WRITE':
        return await this.handleEntityReclassifyWrite(userId, message);

      case 'LOCATION_WRITE':
        return await this.handleLocationWrite(userId, message);

      case 'PROJECT_WRITE':
        return await this.handleProjectWrite(userId, message);

      case 'SKILL_WRITE':
        return await this.handleSkillWrite(userId, message);

      case 'QUEST_WRITE':
        return await this.handleQuestWrite(userId, message);

      case 'FAMILY_WRITE':
        return await this.handleFamilyWrite(userId, message);

      case 'ROMANCE_WRITE':
        return await this.handleRomanceWrite(userId, message);

      case 'EVENT_WRITE':
        return await this.handleEventWrite(userId, message);

      case 'SUGGESTION_DISMISS_WRITE':
        return await this.handleSuggestionDismissWrite(userId, message, options?.threadId);

      case 'ORGANIZATION_QUERY':
        return await this.handleOrganizationQuery(userId, message);

      case 'FAMILY_QUERY':
        return await this.handleFamilyQuery(userId, message);

      case 'LOCATION_QUERY':
        return await this.handleLocationQuery(userId, message);

      case 'ROMANCE_QUERY':
        return await this.handleRomanceQuery(userId, message);

      case 'PROJECT_QUERY':
        return await this.handleProjectQuery(userId, message, options?.threadId);

      case 'SKILL_QUERY':
        return await this.handleSkillQuery(userId, message);

      case 'QUEST_QUERY':
        return await this.handleQuestQuery(userId, message);

      case 'BOOK_QUERY':
        return await this.handleBookQuery(userId, message);

      case 'EXPERIENCE_INGESTION':
        return await this.handleExperienceIngestion(userId, message, options?.messageId, options?.continuityContext);
      
      case 'ACTION_LOG':
        return await this.handleActionLog(userId, message, options);

      case 'NEEDS_CLARIFICATION':
        return await this.handleNeedsClarification(message);

      case 'MIXED':
        return {
          content: "I'm not sure if you're asking me to remember something, sharing a thought, or telling me about something that happened. Can you clarify?",
          response_mode: 'DISAMBIGUATION',
          confidence: 0.5,
        };
      
      case 'UNKNOWN':
      default:
        throw new Error('UNKNOWN mode should fall through to normal chat flow');
    }
  }

  /**
   * Mode 1: Emotional/Existential
   * NO memory check. Just classification + response.
   */
  private async handleEmotionalExistential(
    userId: string,
    message: string
  ): Promise<ModeHandlerResponse> {
    try {
      // Use thought classification service
      const { thoughtOrchestrationService } = await import('../thoughtOrchestration/thoughtOrchestrationService');
      const result = await thoughtOrchestrationService.processThought(userId, message);

      // Response posture already determined
      return {
        content: result.response.text,
        response_mode: 'EMOTIONAL_SUPPORT',
        confidence: result.classification.confidence,
        metadata: {
          thought_type: result.classification.type,
          posture: result.response.posture,
          insecurity_matches: result.insecurity_matches.length,
        },
      };
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to handle emotional/existential mode');
      // Fallback response
      return {
        content: "That's a lot to be carrying. What's sitting heaviest right now?",
        response_mode: 'EMOTIONAL_SUPPORT',
        confidence: 0.5,
      };
    }
  }

  /**
   * Mode 2b: Foundation Recall — explicit "Recall …" commands
   */
  private async handleFoundationRecall(
    userId: string,
    message: string,
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>,
    threadId?: string
  ): Promise<ModeHandlerResponse> {
    try {
      const { executeExplicitRecall } = await import('../chat/explicitRecallService');
      const result = await executeExplicitRecall(
        userId,
        message,
        conversationHistory?.map((m) => ({ role: m.role, content: m.content })) ?? [],
        { threadId }
      );

      return {
        content: result.content,
        response_mode: result.response_mode,
        confidence: result.confidence,
        metadata: result.metadata,
      };
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to handle foundation recall mode');
      return {
        content: "Something went wrong pulling that up — what were you trying to recall?",
        response_mode: 'SILENCE',
        confidence: 0.5,
      };
    }
  }

  /**
   * Current-story cast query: who's new vs. returning in THIS thread, not the
   * whole autobiography. Closed-scope — must not fall back to general recall.
   */
  private async handleCurrentStoryCast(
    userId: string,
    message: string,
    threadId?: string
  ): Promise<ModeHandlerResponse> {
    if (!threadId) {
      return {
        content: "I don't have an active conversation thread to check the cast of — try asking again from within the chat.",
        response_mode: 'SILENCE',
        confidence: 0.5,
      };
    }
    try {
      const { buildCastRosterChatResponse } = await import('../chat/castRosterQueryService');
      return await buildCastRosterChatResponse(userId, message, threadId);
    } catch (error) {
      logger.error({ err: error, userId, threadId }, 'Failed to handle current-story cast query');
      return {
        content: "Something went wrong pulling together who's been part of this conversation — want me to try again?",
        response_mode: 'SILENCE',
        confidence: 0.5,
      };
    }
  }

  /**
   * Explicit "make a group" / "here's the roster" — creates/updates an
   * organization and attaches members with a real per-person outcome.
   */
  private async handleOrganizationGroupWrite(
    userId: string,
    message: string,
    options?: {
      conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
      threadId?: string;
      focusCharacterId?: string;
      focusCharacterName?: string;
    },
  ): Promise<ModeHandlerResponse> {
    const threadId = options?.threadId;
    if (!threadId) {
      return {
        content:
          "I don't have an active conversation thread to attach this group to — try again from within the chat.",
        response_mode: 'SILENCE',
        confidence: 0.5,
      };
    }
    try {
      let threadTitle: string | null = null;
      try {
        const { data } = await supabaseAdmin
          .from('conversation_sessions')
          .select('title')
          .eq('id', threadId)
          .eq('user_id', userId)
          .maybeSingle();
        threadTitle = typeof data?.title === 'string' ? data.title : null;
      } catch {
        /* title optional */
      }

      const { writeOrganizationGroupFromChat } = await import('../chat/groupWriteService');
      let focusCharacterName = options?.focusCharacterName?.trim() || null;
      if (!focusCharacterName && options?.focusCharacterId) {
        const { data, error } = await supabaseAdmin
          .from('characters')
          .select('name')
          .eq('id', options.focusCharacterId)
          .eq('user_id', userId)
          .maybeSingle();
        if (error) {
          logger.warn(
            { err: error, userId, characterId: options.focusCharacterId },
            'Could not resolve focused character for organization group write',
          );
        } else {
          focusCharacterName = typeof data?.name === 'string' ? data.name : null;
        }
      }
      const result = await writeOrganizationGroupFromChat(userId, message, threadId, {
        conversationHistory: options?.conversationHistory,
        threadTitle,
        focusCharacterName,
      });
      return {
        content: result.summary,
        response_mode: 'ORGANIZATION_GROUP_WRITE',
        confidence: 0.9,
        metadata: {
          organizationId: result.organizationId,
          organizationName: result.organizationName,
          groupCreated: result.created,
          groupRenamed: result.renamed,
          groupDeleted: result.deleted === true,
          groupWriteMembers: result.members,
        },
      };
    } catch (error) {
      logger.error({ err: error, userId, threadId }, 'Failed to handle organization group write');
      return {
        content: 'Something went wrong creating or updating that group — want me to try again?',
        response_mode: 'SILENCE',
        confidence: 0.5,
      };
    }
  }

  /**
   * Read-only relational query over the Groups & Organizations Book. The Book
   * UI and chat both call the same compiler, so counts and explanations agree.
   */
  private async handleOrganizationQuery(
    userId: string,
    message: string,
  ): Promise<ModeHandlerResponse> {
    try {
      const [{ organizationQueryRequestSchema }, { queryOrganizationsForUser }] =
        await Promise.all([
          import('@lorebook/api-contracts'),
          import('../organizations/organizationQueryService'),
        ]);
      const request = organizationQueryRequestSchema.parse({ query: message, limit: 12 });
      const result = await queryOrganizationsForUser(userId, request);

      if (result.total === 0) {
        return {
          content: `I couldn't find a group or organization matching that in your Book. I checked names, aliases, rosters, locations, activity, and your relationship to each group.`,
          response_mode: 'ORGANIZATION_QUERY',
          confidence: 0.9,
          metadata: { organizationQuery: result },
        };
      }

      const lines = result.results.map((item) => {
        const details = [
          item.groupType.replaceAll('_', ' '),
          `${item.memberCount} member${item.memberCount === 1 ? '' : 's'}`,
          item.matchedReasons[0],
        ].filter(Boolean);
        return `- **${item.name}** — ${details.join(' · ')}`;
      });
      const shown = result.results.length;
      const heading = result.total === 1
        ? 'I found 1 matching group:'
        : `I found ${result.total} matching groups${shown < result.total ? ` (showing ${shown})` : ''}:`;

      return {
        content: `${heading}\n\n${lines.join('\n')}`,
        response_mode: 'ORGANIZATION_QUERY',
        confidence: 0.94,
        metadata: { organizationQuery: result },
      };
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to handle organization query');
      return {
        content: 'Something went wrong querying your Groups & Organizations Book — want me to try again?',
        response_mode: 'ORGANIZATION_QUERY_FAILED',
        confidence: 0.4,
      };
    }
  }

  private async handleFamilyQuery(userId: string, message: string): Promise<ModeHandlerResponse> {
    try {
      const [{ familyQueryRequestSchema }, { queryFamilyForUser }] = await Promise.all([
        import('@lorebook/api-contracts'),
        import('../kinship/familyQueryService'),
      ]);
      const request = familyQueryRequestSchema.parse({ query: message, limit: 30 });
      const result = await queryFamilyForUser(userId, request);
      const householdLines = result.households.map((household) =>
        `- **${household.name}** — ${household.residentCount} resident${household.residentCount === 1 ? '' : 's'}${household.headOfHousehold ? ` · head: ${household.headOfHousehold}` : ''}`);
      const memberLines = result.results.map((member) => {
        const details = [
          member.relationLabel,
          member.side ? `${member.side} side` : null,
          member.matchedReasons[0],
        ].filter(Boolean);
        return `- **${member.name}** — ${details.join(' · ')}`;
      });
      const lines = [...householdLines, ...memberLines];
      return {
        content: lines.length
          ? `I found ${result.total} matching relative${result.total === 1 ? '' : 's'}${result.households.length ? ` and ${result.households.length} household${result.households.length === 1 ? '' : 's'}` : ''}:\n\n${lines.join('\n')}`
          : `I couldn't find a family-tree member or household matching that. I checked kinship, branches, generations, households, evidence, trends, and review status.`,
        response_mode: 'FAMILY_QUERY',
        confidence: 0.94,
        metadata: { familyQuery: result },
      };
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to handle family query');
      return {
        content: 'Something went wrong querying your Family Book — want me to try again?',
        response_mode: 'FAMILY_QUERY_FAILED',
        confidence: 0.4,
      };
    }
  }

  private async handleLocationQuery(userId: string, message: string): Promise<ModeHandlerResponse> {
    try {
      const [{ locationQueryRequestSchema }, { queryLocationsForUser }] = await Promise.all([
        import('@lorebook/api-contracts'),
        import('../locations/locationQueryService'),
      ]);
      const request = locationQueryRequestSchema.parse({ query: message, limit: 30 });
      const result = await queryLocationsForUser(userId, request);
      const lines = result.results.map((location) => {
        const details = [
          location.type || location.kind.replaceAll('_', ' '),
          `${location.visitCount} visit${location.visitCount === 1 ? '' : 's'}`,
          `${location.mentionCount} mention${location.mentionCount === 1 ? '' : 's'}`,
          location.matchedReasons[0],
        ].filter(Boolean);
        return `- **${location.name}** — ${details.join(' · ')}`;
      });
      return {
        content: lines.length
          ? `I found ${result.total} matching place${result.total === 1 ? '' : 's'}:\n\n${lines.join('\n')}`
          : `I couldn't find a place matching that. I checked names, aliases, geography, visits, mentions, linked people and organizations, hierarchy, map data, and review status.`,
        response_mode: 'LOCATION_QUERY',
        confidence: 0.94,
        metadata: { locationQuery: result },
      };
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to handle location query');
      return {
        content: 'Something went wrong querying your Places Book — want me to try again?',
        response_mode: 'LOCATION_QUERY_FAILED',
        confidence: 0.4,
      };
    }
  }

  private async handleRomanceQuery(userId: string, message: string): Promise<ModeHandlerResponse> {
    try {
      const [{ romanceQueryRequestSchema }, { queryRomanceForUser }] = await Promise.all([
        import('@lorebook/api-contracts'),
        import('../romance/romanceQueryService'),
      ]);
      const request = romanceQueryRequestSchema.parse({ query: message, limit: 30 });
      const result = await queryRomanceForUser(userId, request);
      const lines = result.results.map((relationship) => {
        const details = [
          relationship.relationshipType.replaceAll('_', ' '),
          relationship.status.replaceAll('_', ' '),
          relationship.matchedReasons[0],
          relationship.scoresEvidenceBacked ? null : 'scores still need evidence',
        ].filter(Boolean);
        return `- **${relationship.personName}** — ${details.join(' · ')}`;
      });
      return {
        content: lines.length
          ? `I found ${result.total} matching romantic connection${result.total === 1 ? '' : 's'}:\n\n${lines.join('\n')}`
          : `I couldn't find a grounded Dating & Romance record matching that. I checked confirmed eligibility, relationship type, status, history, risk flags, evidence strength, and Character Book linkage.`,
        response_mode: 'ROMANCE_QUERY',
        confidence: 0.94,
        metadata: { romanceQuery: result },
      };
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to handle Dating and Romance query');
      return {
        content: 'Something went wrong querying Dating & Romance — want me to try again?',
        response_mode: 'ROMANCE_QUERY_FAILED',
        confidence: 0.4,
      };
    }
  }

  private async handleProjectQuery(userId: string, message: string, threadId?: string): Promise<ModeHandlerResponse> {
    try {
      const { answerProjectStateRecall, isProjectStateRecallShape } = await import(
        '../projects/projectStateRecallService'
      );
      if (isProjectStateRecallShape(message)) {
        const state = await answerProjectStateRecall({ userId, message, threadId });
        return {
          content: state.content,
          response_mode: 'PROJECT_STATE_RECALL',
          confidence: state.confidence,
          metadata: state.metadata,
        };
      }

      const [{ projectQueryRequestSchema }, { queryProjectsForUser }] = await Promise.all([
        import('@lorebook/api-contracts'),
        import('../projects/projectQueryService'),
      ]);
      const request = projectQueryRequestSchema.parse({ query: message, limit: 30 });
      const result = await queryProjectsForUser(userId, request);
      const lines = result.results.map((project) => {
        const details = [
          project.type.replaceAll('_', ' '),
          project.status.replaceAll('_', ' '),
          project.matchedReasons[0],
          project.needsReview ? 'needs review' : null,
        ].filter(Boolean);
        return `- **${project.name}** — ${details.join(' · ')}`;
      });
      return {
        content: lines.length
          ? `I found ${result.total} matching project${result.total === 1 ? '' : 's'}:\n\n${lines.join('\n')}`
          : `I couldn't find a grounded project matching that. I checked names, types, status, tags, dates, importance, linked records, and review status.`,
        response_mode: 'PROJECT_QUERY',
        confidence: 0.94,
        metadata: { projectQuery: result },
      };
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to handle Projects Book query');
      return {
        content: 'Something went wrong querying your Projects Book — want me to try again?',
        response_mode: 'PROJECT_QUERY_FAILED',
        confidence: 0.4,
      };
    }
  }

  private async handleSkillQuery(userId: string, message: string): Promise<ModeHandlerResponse> {
    try {
      const [{ skillQueryRequestSchema }, { querySkillsForUser }] = await Promise.all([
        import('@lorebook/api-contracts'),
        import('../skills/skillQueryService'),
      ]);
      const request = skillQueryRequestSchema.parse({ query: message, limit: 30 });
      const result = await querySkillsForUser(userId, request);
      const lines = result.results.map((skill) => {
        const details = [
          skill.category.replaceAll('_', ' '),
          `level ${skill.currentLevel}`,
          skill.matchedReasons[0],
          skill.needsReview ? 'needs review' : null,
        ].filter(Boolean);
        return `- **${skill.name}** — ${details.join(' · ')}`;
      });
      return {
        content: lines.length
          ? `I found ${result.total} matching skill${result.total === 1 ? '' : 's'}:\n\n${lines.join('\n')}`
          : `I couldn't find a grounded skill matching that. I checked category, activity, practice, growth, work use, related projects, confidence, and evidence.`,
        response_mode: 'SKILL_QUERY',
        confidence: 0.94,
        metadata: { skillQuery: result },
      };
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to handle Skills Book query');
      return {
        content: 'Something went wrong querying your Skills Book — want me to try again?',
        response_mode: 'SKILL_QUERY_FAILED',
        confidence: 0.4,
      };
    }
  }

  private async handleQuestQuery(userId: string, message: string): Promise<ModeHandlerResponse> {
    try {
      const [{ questQueryRequestSchema }, { queryQuestsForUser }] = await Promise.all([
        import('@lorebook/api-contracts'),
        import('../quests/questQueryService'),
      ]);
      const request = questQueryRequestSchema.parse({ query: message, limit: 30 });
      const result = await queryQuestsForUser(userId, request);
      const lines = result.results.map((quest) => {
        const details = [
          quest.type,
          quest.status,
          `${quest.progress}%`,
          quest.matchedReasons[0],
          quest.needsReview ? 'needs review' : null,
        ].filter(Boolean);
        return `- **${quest.title}** — ${details.join(' · ')}`;
      });
      return {
        content: lines.length
          ? `I found ${result.total} matching quest${result.total === 1 ? '' : 's'}:\n\n${lines.join('\n')}`
          : `I couldn't find a grounded Quest Log item matching that. I checked status, type, priority, progress, deadlines, blockers, tags, and review state.`,
        response_mode: 'QUEST_QUERY',
        confidence: 0.95,
        metadata: { questQuery: result },
      };
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to handle Quest Log query');
      return {
        content: 'Something went wrong querying your Quest Log — want me to try again?',
        response_mode: 'QUEST_QUERY_FAILED',
        confidence: 0.4,
      };
    }
  }

  private async handleBookQuery(userId: string, message: string): Promise<ModeHandlerResponse> {
    try {
      const { answerBookQueryForUser } = await import('../query/bookQueryChatService');
      return await answerBookQueryForUser(userId, message);
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to handle cross-Book query');
      return {
        content: 'Something went wrong querying your Books. No answer was invented.',
        response_mode: 'BOOK_QUERY_FAILED',
        confidence: 0.2,
        metadata: { executor: 'books' },
      };
    }
  }

  /**
   * Explicit "add these people to my character book" request — resolves and
   * persists each mentioned person, reporting a real per-character outcome.
   */
  private async handleCharacterBookWrite(
    userId: string,
    message: string,
    threadId?: string
  ): Promise<ModeHandlerResponse> {
    if (!threadId) {
      return {
        content: "I don't have an active conversation thread to pull the cast from — try again from within the chat.",
        response_mode: 'SILENCE',
        confidence: 0.5,
      };
    }
    try {
      const { writeCharacterBookFromChat } = await import('../chat/characterBookWriteService');
      const { results, summary, metadata } = await writeCharacterBookFromChat(userId, message, threadId);
      return {
        content: summary,
        response_mode: 'CHARACTER_BOOK_WRITE',
        confidence: 0.9,
        metadata: { characterBookWriteResults: results, ...(metadata ?? {}) },
      };
    } catch (error) {
      logger.error({ err: error, userId, threadId }, 'Failed to handle character book write request');
      return {
        content: "Something went wrong saving that to your character book — want me to try again?",
        response_mode: 'SILENCE',
        confidence: 0.5,
      };
    }
  }

  private async handleEntityReclassifyWrite(
    userId: string,
    message: string,
  ): Promise<ModeHandlerResponse> {
    try {
      const { writeEntityReclassifyFromChat } = await import('../chat/entityReclassifyWriteService');
      const result = await writeEntityReclassifyFromChat(userId, message);
      return {
        content: result.summary,
        response_mode: 'ENTITY_RECLASSIFY_WRITE',
        confidence: 0.92,
        metadata: {
          reclassifiedFrom: result.sourceDomain,
          reclassifiedSourceId: result.sourceId,
          reclassifiedSourceName: result.sourceName,
          reclassifiedTo: result.target,
          reclassifiedTargetId: result.targetId,
          reclassifiedTargetName: result.targetName,
          reclassifiedMerged: result.mergedIntoExisting,
        },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Could not reclassify that entity.';
      logger.warn({ err: error, userId }, 'entity reclassify write failed');
      return { content: msg, response_mode: 'ENTITY_RECLASSIFY_WRITE', confidence: 0.55 };
    }
  }

  private async handleLocationWrite(userId: string, message: string): Promise<ModeHandlerResponse> {
    try {
      const { writeLocationFromChat } = await import('../chat/locationWriteService');
      const result = await writeLocationFromChat(userId, message);
      return {
        content: result.summary,
        response_mode: 'LOCATION_WRITE',
        confidence: 0.92,
        metadata: {
          locationWriteOperation: result.operation,
          locationId: result.locationId,
          locationName: result.locationName,
        },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Could not update Places.';
      return { content: msg, response_mode: 'LOCATION_WRITE', confidence: 0.55 };
    }
  }

  private async handleProjectWrite(userId: string, message: string): Promise<ModeHandlerResponse> {
    try {
      const { writeProjectFromChat } = await import('../chat/projectWriteService');
      const result = await writeProjectFromChat(userId, message);
      return {
        content: result.summary,
        response_mode: 'PROJECT_WRITE',
        confidence: 0.92,
        metadata: {
          projectWriteOperation: result.operation,
          projectId: result.projectId,
          projectName: result.projectName,
        },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Could not update Projects.';
      return { content: msg, response_mode: 'PROJECT_WRITE', confidence: 0.55 };
    }
  }

  private async handleSkillWrite(userId: string, message: string): Promise<ModeHandlerResponse> {
    try {
      const { writeSkillFromChat } = await import('../chat/skillWriteService');
      const result = await writeSkillFromChat(userId, message);
      return {
        content: result.summary,
        response_mode: 'SKILL_WRITE',
        confidence: 0.92,
        metadata: {
          skillWriteOperation: result.operation,
          skillId: result.skillId,
          skillName: result.skillName,
        },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Could not update Skills.';
      return { content: msg, response_mode: 'SKILL_WRITE', confidence: 0.55 };
    }
  }

  private async handleQuestWrite(userId: string, message: string): Promise<ModeHandlerResponse> {
    try {
      const { writeQuestFromChat } = await import('../chat/questWriteService');
      const result = await writeQuestFromChat(userId, message);
      return {
        content: result.summary,
        response_mode: 'QUEST_WRITE',
        confidence: 0.92,
        metadata: {
          questWriteOperation: result.operation,
          questId: result.questId,
          questTitle: result.questTitle,
        },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Could not update the Quest Log.';
      return { content: msg, response_mode: 'QUEST_WRITE', confidence: 0.55 };
    }
  }

  private async handleFamilyWrite(userId: string, message: string): Promise<ModeHandlerResponse> {
    try {
      const { writeFamilyFromChat } = await import('../chat/familyWriteService');
      const result = await writeFamilyFromChat(userId, message);
      return {
        content: result.summary,
        response_mode: 'FAMILY_WRITE',
        confidence: 0.92,
        metadata: {
          familyWriteOperation: result.operation,
          characterId: result.characterId,
          characterName: result.characterName,
          relation: result.relation,
        },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Could not update Family.';
      return { content: msg, response_mode: 'FAMILY_WRITE', confidence: 0.55 };
    }
  }

  private async handleRomanceWrite(userId: string, message: string): Promise<ModeHandlerResponse> {
    try {
      const { writeRomanceFromChat } = await import('../chat/romanceWriteService');
      const result = await writeRomanceFromChat(userId, message);
      return {
        content: result.summary,
        response_mode: 'ROMANCE_WRITE',
        confidence: 0.92,
        metadata: {
          romanceWriteOperation: result.operation,
          relationshipId: result.relationshipId,
          partnerName: result.partnerName,
          romanceStatus: result.status,
        },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Could not update Dating & Romance.';
      return { content: msg, response_mode: 'ROMANCE_WRITE', confidence: 0.55 };
    }
  }

  private async handleEventWrite(userId: string, message: string): Promise<ModeHandlerResponse> {
    try {
      const { writeEventFromChat } = await import('../chat/eventWriteService');
      const result = await writeEventFromChat(userId, message);
      return {
        content: result.summary,
        response_mode: 'EVENT_WRITE',
        confidence: 0.92,
        metadata: {
          eventWriteOperation: result.operation,
          eventId: result.eventId,
          eventTitle: result.eventTitle,
          locationName: result.locationName,
        },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Could not post that Life Log event.';
      return { content: msg, response_mode: 'EVENT_WRITE', confidence: 0.55 };
    }
  }

  private async handleSuggestionDismissWrite(
    userId: string,
    message: string,
    threadId?: string,
  ): Promise<ModeHandlerResponse> {
    const parsed = parseSuggestionDismissRequest(message);
    if (!parsed.domain || !parsed.name) {
      return {
        content:
          'Tell me both the book and the suggestion name, like "dismiss the place suggestion South Coast Plaza" or "that project suggestion MemoVault is just noise."',
        response_mode: 'SUGGESTION_DISMISS_WRITE',
        confidence: 0.55,
      };
    }

    try {
      let result: import('../suggestionDismissalService').RecordDismissalResult | null = null;
      if (parsed.domain === 'projects') {
        const { projectSuggestionService } = await import('../projects/projectSuggestionService');
        result = await projectSuggestionService.rejectByName(userId, parsed.name, { threadId, reason: parsed.reason });
      } else if (parsed.domain === 'skills') {
        const { skillSuggestionService } = await import('../skills/skillSuggestionService');
        result = await skillSuggestionService.rejectByName(userId, parsed.name, { threadId, reason: parsed.reason });
      } else if (parsed.domain === 'quests') {
        const { questSuggestionService } = await import('../quests/questSuggestionService');
        result = await questSuggestionService.rejectByTitle(userId, parsed.name, { threadId, reason: parsed.reason });
      } else {
        const { suggestionDismissalService } = await import('../suggestionDismissalService');
        result = await suggestionDismissalService.recordDismissal(userId, parsed.domain, {
          name: parsed.name,
          threadId,
          reason: parsed.reason,
        });
      }

      const { entityLearningService } = await import('../entityLearningService');
      void entityLearningService.recordSuggestionDismissalLearning({
        userId,
        domain: parsed.domain,
        name: parsed.name,
        result,
      });

      const domainLabel = parsed.domain === 'locations'
        ? 'Places'
        : parsed.domain === 'characters'
          ? 'Character'
          : parsed.domain === 'quests'
            ? 'Quest'
            : parsed.domain === 'skills'
              ? 'Skills'
              : 'Projects';
      const permanence = result?.isPermanent
        ? ` I’ll stop surfacing “${parsed.name}” in ${domainLabel}.`
        : ` I’ve hidden it for now${result?.dismissCount ? ` (${result.dismissCount}/${5} dismissals)` : ''}.`;

      return {
        content: `Dismissed “${parsed.name}” from ${domainLabel} suggestions.${permanence}`,
        response_mode: 'SUGGESTION_DISMISS_WRITE',
        confidence: 0.9,
        metadata: {
          suggestionDismissal: {
            domain: parsed.domain,
            name: parsed.name,
            reason: parsed.reason ?? null,
            result,
          },
        },
      };
    } catch (error) {
      logger.error({ err: error, userId, message }, 'Failed to dismiss suggestion from chat');
      return {
        content: `Something went wrong dismissing “${parsed.name}” — want me to try again?`,
        response_mode: 'SUGGESTION_DISMISS_WRITE',
        confidence: 0.4,
      };
    }
  }

  /**
   * Mode 2: Memory Recall (Factual)
   * Foundation lore first when the query matches structured recall patterns.
   */
  private async handleMemoryRecall(
    userId: string,
    message: string,
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>,
    threadId?: string
  ): Promise<ModeHandlerResponse> {
    try {
      const { matchesFoundationRecallQuery } = await import('../chat/recallIntentPatterns');
      if (matchesFoundationRecallQuery(message)) {
        const { executeExplicitRecall } = await import('../chat/explicitRecallService');
        const foundation = await executeExplicitRecall(
          userId,
          message,
          conversationHistory?.map((m) => ({ role: m.role, content: m.content })) ?? [],
          { threadId }
        );
        if (foundation.response_mode !== 'SILENCE') {
          return {
            content: foundation.content,
            response_mode: foundation.response_mode,
            confidence: foundation.confidence,
            metadata: foundation.metadata,
          };
        }
      }

      const { memoryRecallEngine } = await import('../memoryRecall/memoryRecallEngine');
      
      const recallResult = await memoryRecallEngine.executeRecall({
        raw_text: message,
        user_id: userId,
        persona: 'ARCHIVIST', // Facts only
      });

      // Handle silence (doesn't know)
      if (recallResult.silence) {
        return {
          content: recallResult.silence.message,
          response_mode: 'SILENCE',
          confidence: 1.0,
          metadata: {
            reason: recallResult.silence.reason,
          },
        };
      }

      // Surface journal fragments even when confidence is low — never hide matches
      if (recallResult.confidence < 0.5 && recallResult.entries.length === 0) {
        const { executeExplicitRecall } = await import('../chat/explicitRecallService');
        const { buildDiagnosticRecall } = await import('../chat/failureAwareHandler');
        const foundation = await executeExplicitRecall(
          userId,
          message,
          conversationHistory?.map((m) => ({ role: m.role, content: m.content })) ?? [],
          { threadId }
        );
        if (foundation.response_mode !== 'SILENCE') {
          return {
            content: foundation.content,
            response_mode: foundation.response_mode,
            confidence: foundation.confidence,
            metadata: foundation.metadata,
          };
        }
        if ((conversationHistory?.length ?? 0) > 0) {
          const diagnostic = await buildDiagnosticRecall(userId, message, {
            conversationHistory: conversationHistory?.map((m) => ({ role: m.role, content: m.content })) ?? [],
            threadId,
          });
          return {
            content: diagnostic,
            response_mode: 'DIAGNOSTIC',
            confidence: 0.7,
            metadata: { recall_confidence: recallResult.confidence },
          };
        }
        return {
          content: "I don't have stored memories matching that yet. Tell me more and I'll add it to your record.",
          response_mode: 'LOW_CONFIDENCE_RECALL',
          confidence: recallResult.confidence,
          metadata: {
            recall_confidence: recallResult.confidence,
          },
        };
      }

      // Format recall response
      const { formatRecallChatResponse } = await import('../memoryRecall/recallChatFormatter');
      const formatted = formatRecallChatResponse(recallResult, 'ARCHIVIST');
      
      return {
        content: formatted.content || 'I found some memories related to that.',
        response_mode: formatted.response_mode || 'MEMORY_RECALL',
        confidence: formatted.confidence || recallResult.confidence,
        metadata: {
          recall_sources: formatted.recall_sources,
          recall_meta: formatted.recall_meta,
          confidence_label: formatted.confidence_label,
          disclaimer: formatted.disclaimer,
        },
      };
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to handle memory recall mode');
      return {
        content: "Something went wrong pulling that up — what were you trying to recall?",
        response_mode: 'SILENCE',
        confidence: 0.5,
      };
    }
  }

  private async handleSubjectTimeline(
    userId: string,
    message: string,
    threadId?: string,
    messageId?: string,
  ): Promise<ModeHandlerResponse> {
    try {
      const { buildSubjectTimelineChatResponse } = await import('../chat/subjectTimelineChatService');
      return await buildSubjectTimelineChatResponse({ userId, message, threadId, messageId });
    } catch (error) {
      logger.error({ err: error, userId, threadId }, 'Failed to handle subject timeline mode');
      return {
        content:
          'I recognized this as a timeline request, but the timeline compiler could not complete it.',
        response_mode: 'TIMELINE_FAILED',
        confidence: 0,
        metadata: {
          timeline_status: 'failed',
          error_code: 'TIMELINE_COMPILER_FAILED',
        },
      };
    }
  }

  /**
   * Mode 3: Narrative Recall (Complex Stories)
   * Must distinguish: event, perspective, later insight
   */
  private async handleNarrativeRecall(
    userId: string,
    message: string
  ): Promise<ModeHandlerResponse> {
    try {
      const { storyAccountService } = await import('../storyAccount/storyAccountService');
      
      // Extract story/event name from message
      const storyName = await storyAccountService.extractStoryName(message);
      
      // Get all accounts of this story
      const accounts = await storyAccountService.getStoryAccounts(userId, storyName);

      if (accounts.length === 0) {
        // Phase 4.5: narrative fallback from journal_entries when story DB is empty
        const { narrativeFromJournalFallback } = await import('../narrativeRecall/narrativeRecallCorrection');
        const fallback = await narrativeFromJournalFallback(userId, storyName);
        if (fallback) {
          return {
            content: fallback.narrative,
            response_mode: 'NARRATIVE_RECALL',
            confidence: 0.8,
            metadata: { story_name: storyName, derived_from: fallback.derived_from },
          };
        }
        return {
          content: `I don't have much on "${storyName}" yet — what happened?`,
          response_mode: 'SILENCE',
          confidence: 1.0,
          metadata: { story_name: storyName },
        };
      }

      // Build multi-layered response
      const response = storyAccountService.buildNarrativeResponse(accounts);
      
      return {
        content: response,
        response_mode: 'NARRATIVE_RECALL',
        confidence: 0.9,
        metadata: {
          accounts_count: accounts.length,
          story_name: storyName,
        },
      };
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to handle narrative recall mode');
      return {
        content: "Something went wrong pulling that up — what's the story you're thinking of?",
        response_mode: 'SILENCE',
        confidence: 0.5,
      };
    }
  }

  /**
   * Mode 4: Experience Ingestion
   * Creates lived experiences (macro: duration, context, narrative arc)
   */
  private async handleExperienceIngestion(
    userId: string,
    message: string,
    messageId?: string,
    continuityContext?: string
  ): Promise<ModeHandlerResponse> {
    try {
      const { loadLivingMemoryPreferences } = await import('../preferences/livingMemoryPreferences');
      const livingMemory = await loadLivingMemoryPreferences(userId);

      // Fire-and-forget: Extract and store experience structure (Living Memory write gate)
      if (messageId && livingMemory.writeLivingMemory) {
        const { eventExtractionService } = await import('../eventExtraction/eventExtractionService');
        eventExtractionService.extractEventStructure(userId, message, messageId).catch(err => {
          logger.warn({ err }, 'Experience extraction failed (non-blocking)');
        });
      } else if (messageId && !livingMemory.writeLivingMemory) {
        logger.debug({ userId }, 'Living Memory write disabled — skipping experience extraction');
      }

      // Check if it's a dump (large multi-part share)
      const isDump = message.length > 500 || /(here's everything|here's what happened|dumping|let me tell you|here's the whole)/i.test(message);
      const isLifeUpdate = isMultiTransitionLifeUpdate(message);

      // Use LLM for a warm, contextual acknowledgment
      try {
        const { openai } = await import('../../lib/openai');
        const { config } = await import('../../config');
        const basePrompt = isLifeUpdate
          ? `You are LoreBook, a personal lore and memory AI. ${LIFE_UPDATE_REFLECTION_GUIDANCE}`
          : isDump
          ? `You are LoreBook, a personal lore and memory AI. The user just shared a detailed experience. ${INGESTION_ACK_GUIDANCE}`
          : `You are LoreBook, a personal lore and memory AI. The user just shared a moment or experience from their life. ${INGESTION_ACK_GUIDANCE}`;
        // Returning to an idle thread: orient quietly to the resumed context
        const systemPrompt = continuityContext ? `${basePrompt}${continuityContext}` : basePrompt;
        const completion = await openai.chat.completions.create({
          model: config.chatModel,
          temperature: 0.75,
          max_tokens: 120,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: message },
          ],
        });
        const ackText = completion.choices[0]?.message?.content?.trim() || INGESTION_ACK_FALLBACK;
        return {
          content: ackText,
          response_mode: isLifeUpdate ? 'LIFE_UPDATE_REFLECTION' : 'INGESTION_ACK',
          confidence: 1.0,
          metadata: { processing: 'async', is_dump: isDump, state_changes_reflected: isLifeUpdate },
        };
      } catch {
        return {
          content: INGESTION_ACK_FALLBACK,
          response_mode: isLifeUpdate ? 'LIFE_UPDATE_REFLECTION' : 'INGESTION_ACK',
          confidence: 0.9,
          metadata: { processing: 'async', is_dump: isDump, state_changes_reflected: false },
        };
      }
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to handle experience ingestion mode');
      return {
        content: INGESTION_ACK_FALLBACK,
        response_mode: 'INGESTION_ACK',
        confidence: 0.8,
      };
    }
  }

  /**
   * NEEDS_CLARIFICATION: Ambiguous milestone/achievement.
   * Ask what they mean before ingesting. No save, no ingest—client has it in conversationHistory.
   */
  private async handleNeedsClarification(message: string): Promise<ModeHandlerResponse> {
    const text = message.toLowerCase();
    // Try to extract "X" from "got X working" / "have X working" / "finally got X working"
    const gotMatch = text.match(/(?:got|have|got it) (\S+(?:\s+\S+){0,4}?) (?:working|to work)/i);
    const phrase = gotMatch ? gotMatch[1].trim() : null;

    let content: string;
    if (phrase) {
      if (/\b(chat|app|lorebook|lore book)\b/i.test(phrase)) {
        content = `What do you mean by getting ${phrase} working? Are you talking about getting Lore Book to respond, or something else you did?`;
      } else {
        content = `What do you mean by getting ${phrase} working? Are you talking about something in the app, or something you did or achieved?`;
      }
    } else {
      content = "What do you mean? Are you talking about the app, or something you did or achieved?";
    }

    return {
      content,
      response_mode: 'CLARIFY',
      confidence: 0.9,
      metadata: { clarification: true },
    };
  }

  /**
   * Mode 5: Action Log
   * Logs atomic actions (micro: verb-forward, instant)
   * Silent - no user interruption
   */
  private async handleActionLog(
    userId: string,
    message: string,
    options?: {
      messageId?: string;
      conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
    }
  ): Promise<ModeHandlerResponse> {
    try {
      // Fire-and-forget: Log the action (silently, no response needed)
      if (options?.messageId) {
        const { actionLoggingService } = await import('../actionLogging/actionLoggingService');
        type ActionContext = import('../actionLogging/actionLoggingService').ActionContext;
        
        // Get message timestamp
        const messageTimestamp = await this.getMessageTimestamp(options.messageId);
        
        // Build context with timestamps from conversation history
        // Note: conversation history doesn't have timestamps, but we can infer from message order
        const conversationHistory = options.conversationHistory?.map((msg, index) => ({
          role: msg.role,
          content: msg.content,
          timestamp: messageTimestamp 
            ? new Date(messageTimestamp.getTime() - ((options.conversationHistory!.length - index) * 60000))
            : undefined,
        })) || [];
        
        const context: ActionContext = {
          messageTimestamp: messageTimestamp || undefined,
          conversationHistory,
        };
        
        // logAction will find open experience internally if not provided
        actionLoggingService.logAction(userId, message, options.messageId, context).catch(err => {
          logger.warn({ err }, 'Action logging failed (non-blocking)');
        });
      }

      // LoreBook signature — occasional "Noted." for log/deposit moments (not every time)
      const { maybeNotedSignatureResponse } = await import('../chat/notedSignature');
      const signature = maybeNotedSignatureResponse({
        message,
        conversationHistory: options?.conversationHistory,
      });
      if (signature) {
        return {
          content: signature,
          response_mode: 'SILENT_LOG',
          confidence: 0.95,
          metadata: { processing: 'async', signature: 'noted' },
        };
      }

      // Ask the AI for a brief, warm acknowledgment instead of a dead "Noted."
      try {
        const { openai } = await import('../../lib/openai');
        const { config } = await import('../../config');
        const ackCompletion = await openai.chat.completions.create({
          model: config.chatModel,
          temperature: 0.7,
          max_tokens: 80,
          messages: [
            {
              role: 'system',
              content: 'You are LoreBook, a lore-aware AI assistant. The user just logged a quick note or action. Acknowledge it briefly and warmly in 1-2 sentences. You may ask a light follow-up question if it would be natural. Do not be robotic.',
            },
            { role: 'user', content: message },
          ],
        });
        const ackText = ackCompletion.choices[0]?.message?.content?.trim() || 'Logged.';
        return {
          content: ackText,
          response_mode: 'SILENT_LOG',
          confidence: 0.9,
          metadata: { processing: 'async' },
        };
      } catch {
        return {
          content: 'Got it, logged.',
          response_mode: 'SILENT_LOG',
          confidence: 0.9,
          metadata: { processing: 'async' },
        };
      }
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to handle action log mode');
      return {
        content: 'Got it, logged.',
        response_mode: 'SILENT_LOG',
        confidence: 0.8,
      };
    }
  }

  /**
   * NARRATIVE_STORY: Build a narrative from the user's journal entries.
   * Calls StoryOfSelfEngine and returns structured story data + a text summary.
   */
  private async handleNarrativeStory(
    userId: string,
    _message: string
  ): Promise<ModeHandlerResponse> {
    try {
      const { supabaseAdmin: db } = await import('../supabaseClient');
      const { StoryOfSelfEngine } = await import('../storyOfSelf/storyOfSelfEngine');

      // Fetch recent entries (up to 200 for sufficient signal)
      const { data: rows } = await db
        .from('journal_entries')
        .select(JOURNAL_COLS)
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(200);

      const entries = (rows ?? []) as any[];

      if (entries.length === 0) {
        return {
          content: "You're starting to build that story now. As you share — recurring people, places, what you're working on, what matters — LoreBook gradually accumulates the patterns that become your narrative. Share something from your life and it becomes part of your record.",
          response_mode: 'NARRATIVE_STORY',
          confidence: 1.0,
          metadata: { empty: true },
        };
      }

      const engine = new StoryOfSelfEngine();
      const story = await engine.process({ entries });

      // Build readable text summary
      const topThemes = story.themes
        .sort((a, b) => b.strength - a.strength)
        .slice(0, 3)
        .map(t => t.theme.replace(/_/g, ' '))
        .join(', ');

      const tpLines = story.turningPoints
        .slice(0, 3)
        .map(tp => `- **${tp.category}** (${tp.timestamp.substring(0, 7)}): ${tp.description}`)
        .join('\n');

      const arcLines = story.arcs
        .slice(0, 3)
        .map(arc => `**${arc.title}** *(${arc.era})*\n${arc.content}`)
        .join('\n\n');

      const content = [
        story.summary,
        '',
        `**Narrative Mode:** ${story.mode.mode.charAt(0).toUpperCase() + story.mode.mode.slice(1)}`,
        `**Core Themes:** ${topThemes}`,
        '',
        tpLines.length > 0 ? `**Turning Points:**\n${tpLines}` : null,
        '',
        arcLines.length > 0 ? `**Story Arcs:**\n${arcLines}` : null,
        '',
        story.voicePrint ? `*${story.voicePrint}*` : null,
      ]
        .filter(Boolean)
        .join('\n');

      return {
        content,
        response_mode: 'NARRATIVE_STORY',
        confidence: story.coherence.coherenceScore,
        metadata: {
          story,
          entry_count: entries.length,
          coherence_score: story.coherence.coherenceScore,
        },
      };
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to handle narrative story mode');
      return {
        content: "I wasn't able to build your narrative right now. Try again in a moment.",
        response_mode: 'NARRATIVE_STORY',
        confidence: 0.5,
      };
    }
  }

  /**
   * Get message timestamp from chat_messages table
   */
  private async getMessageTimestamp(messageId: string): Promise<Date | null> {
    try {
      const { data } = await supabaseAdmin
        .from('chat_messages')
        .select('created_at')
        .eq('id', messageId)
        .single();
      
      const row = data as any;
      if (!row?.created_at) {
        return null;
      }

      return new Date(row.created_at);
    } catch (error) {
      logger.debug({ err: error, messageId }, 'Failed to get message timestamp');
      return null;
    }
  }
}

// Pronouns/determiners/connective fragments the free-text dismiss command's
// regexes keep capturing as a "suggestion name" ("Dismiss You from Character
// suggestions", "remove That project suggestion"). Deliberately independent
// of characterRegistry's JUNK_NAMES to avoid pulling that module's heavy
// dependency chain into the mode-router.
const DISMISS_NAME_JUNK_WORDS = new Set([
  'i', 'me', 'my', 'mine', 'you', 'your', 'yours', 'he', 'him', 'his', 'she',
  'her', 'hers', 'they', 'them', 'their', 'we', 'us', 'our', 'it', 'its',
  'thats', 'whats', 'wheres', 'whens', 'whos', 'hows', 'lets',
  'the', 'a', 'an', 'this', 'that', 'these', 'those', 'just', 'from',
  'someone', 'somebody', 'anyone', 'anybody', 'everyone', 'everybody',
  'people', 'person', 'help', 'please', 'okay', 'ok', 'yes', 'no', 'wait',
]);

function parseSuggestionDismissRequest(message: string): {
  domain?: import('../suggestionDismissalService').SuggestionDismissalDomain;
  name?: string;
  reason?: import('../suggestionDismissalService').DismissSuggestionReason;
} {
  const text = message.trim();
  const lower = text.toLowerCase();
  const domain = /\b(place|location)\b/.test(lower)
    ? 'locations'
    : /\b(character|person|people)\b/.test(lower)
      ? 'characters'
      : /\b(project)\b/.test(lower)
        ? 'projects'
        : /\b(skill)\b/.test(lower)
          ? 'skills'
          : /\b(quest|goal)\b/.test(lower)
            ? 'quests'
            : undefined;

  const quoted = text.match(/["“”']([^"“”']{2,120})["“”']/);
  const afterSuggestion = text.match(
    /\b(?:suggestion|detected|entry|item)\s+([A-Z][\p{L}\p{N}'’.-]*(?:\s+[A-Z0-9][\p{L}\p{N}'’.-]*){0,5})/u,
  );
  const afterVerb = text.match(
    /\b(?:dismiss|remove|delete|hide|suppress|reject|drop)\b(?:\s+(?:the|this|that|wrong))?(?:\s+(?:place|location|character|person|project|skill|quest|goal))?(?:\s+suggestion)?\s+([A-Z][\p{L}\p{N}'’.-]*(?:\s+[A-Z0-9][\p{L}\p{N}'’.-]*){0,5})/u,
  );
  const rawName = quoted?.[1]?.trim() || afterVerb?.[1]?.trim() || afterSuggestion?.[1]?.trim();
  // A bare pronoun/connective fragment ("You", "That") is regex noise, not a
  // real suggestion name — never pass it to recordDismissal, which would
  // otherwise happily dismiss a "You" or "That" suggestion that was never
  // actually pending. Fall through to the clarifying prompt instead.
  const name =
    rawName &&
    !evaluateSentenceBleed(rawName).rejected &&
    !DISMISS_NAME_JUNK_WORDS.has(rawName.toLowerCase())
      ? rawName
      : undefined;

  const reason = /\b(wrong book|should be|not a place|not a location|not a character|not a person|not a project|not a skill|not a quest|not a goal)\b/i.test(text)
    ? 'wrong_book'
    : /\b(duplicate|already tracked|already have)\b/i.test(text)
      ? 'duplicate'
      : /\b(noise|garbage|fragment|bad extraction|not real)\b/i.test(text)
        ? 'noise'
        : /\b(not a|not an|wrong)\b/i.test(text)
          ? 'not_entity'
          : undefined;

  return { domain, name, reason };
}

export const modeHandlers = new ModeHandlers();
