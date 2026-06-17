/**
 * Loads relationship/closeness/trust analytics for entity-scoped chat.
 * Shared by streaming and non-streaming chat paths.
 */
import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { locationService } from '../locationService';

export type EntityContextInput = {
  type: 'CHARACTER' | 'LOCATION' | 'PERCEPTION' | 'MEMORY' | 'ENTITY' | 'GOSSIP' | 'ROMANTIC_RELATIONSHIP' | 'ORG';
  id: string;
};

export type EntityAnalyticsBundle = {
  entityAnalytics: Record<string, unknown> | null;
  entityConfidence: number | null;
  analyticsGate: { allowed: boolean; reason?: string } | null;
};

function normalizeEntityType(type: EntityContextInput['type']): 'CHARACTER' | 'LOCATION' | 'ORG' | 'ROMANTIC_RELATIONSHIP' {
  if (type === 'ENTITY' || type === 'ORG') return 'ORG';
  if (type === 'ROMANTIC_RELATIONSHIP') return 'ROMANTIC_RELATIONSHIP';
  if (type === 'LOCATION') return 'LOCATION';
  return 'CHARACTER';
}

export async function loadEntityAnalyticsForContext(
  userId: string,
  entityContext?: EntityContextInput
): Promise<EntityAnalyticsBundle> {
  if (!entityContext) {
    return { entityAnalytics: null, entityConfidence: null, analyticsGate: null };
  }

  try {
    const { entityConfidenceService } = await import('../entityConfidenceService');
    const normalizedType = normalizeEntityType(entityContext.type);

    const analyticsGate = await entityConfidenceService.shouldSurfaceAnalytics(
      userId,
      entityContext.id,
      normalizedType === 'ROMANTIC_RELATIONSHIP' ? 'CHARACTER' : normalizedType
    );

    const entityConfidence = await entityConfidenceService['getCurrentEntityConfidence'](
      userId,
      entityContext.id,
      normalizedType === 'ROMANTIC_RELATIONSHIP' ? 'CHARACTER' : normalizedType
    );

    let entityAnalytics: Record<string, unknown> | null = null;

    if (entityContext.type === 'CHARACTER') {
      const { data: character } = await supabaseAdmin
        .from('characters')
        .select('*')
        .eq('id', entityContext.id)
        .eq('user_id', userId)
        .single();
      if (character) {
        const { characterAnalyticsService } = await import('../characterAnalyticsService');
        entityAnalytics = await characterAnalyticsService.calculateAnalytics(userId, entityContext.id, character);
      }
    } else if (entityContext.type === 'LOCATION') {
      const location = await locationService.getLocationProfile(userId, entityContext.id);
      if (location) {
        const { locationAnalyticsService } = await import('../locationAnalyticsService');
        entityAnalytics = await locationAnalyticsService.calculateAnalytics(userId, entityContext.id, location);
      }
    } else if (entityContext.type === 'ENTITY' || entityContext.type === 'ORG') {
      const { organizationService } = await import('../organizationService');
      const org = await organizationService.getOrganization(userId, entityContext.id);
      if (org) {
        const { groupAnalyticsService } = await import('../groupAnalyticsService');
        entityAnalytics = await groupAnalyticsService.calculateAnalytics(userId, entityContext.id, org);
      }
    } else if (entityContext.type === 'ROMANTIC_RELATIONSHIP') {
      const { data: relationship } = await supabaseAdmin
        .from('romantic_relationships')
        .select('*')
        .eq('id', entityContext.id)
        .eq('user_id', userId)
        .single();

      if (relationship) {
        let personName = 'Unknown';
        if (relationship.person_type === 'character') {
          const { data: character } = await supabaseAdmin
            .from('characters')
            .select('name')
            .eq('id', relationship.person_id)
            .single();
          personName = character?.name || 'Unknown';
        }

        const { romanticRelationshipAnalytics } = await import('../conversationCentered/romanticRelationshipAnalytics');
        const analytics = await romanticRelationshipAnalytics.generateAnalytics(userId, entityContext.id);

        entityAnalytics = {
          relationship,
          personName,
          analytics: analytics || {
            pros: relationship.pros || [],
            cons: relationship.cons || [],
            redFlags: relationship.red_flags || [],
            greenFlags: relationship.green_flags || [],
            strengths: relationship.strengths || [],
            weaknesses: relationship.weaknesses || [],
            affectionScore: relationship.affection_score || 0.5,
            compatibilityScore: relationship.compatibility_score || 0.5,
            healthScore: relationship.relationship_health || 0.5,
            intensityScore: relationship.emotional_intensity || 0.5,
          },
        };
      }
    }

    if (entityAnalytics && entityConfidence !== null && entityConfidence < 0.5) {
      entityAnalytics = entityConfidenceService['softenAnalyticsLanguage'](entityAnalytics, entityConfidence);
    }

    return { entityAnalytics, entityConfidence, analyticsGate };
  } catch (error) {
    logger.debug({ error, entityContext }, 'Failed to load entity analytics, continuing without');
    return { entityAnalytics: null, entityConfidence: null, analyticsGate: null };
  }
}
