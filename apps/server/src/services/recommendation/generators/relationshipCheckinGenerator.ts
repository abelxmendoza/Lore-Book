import { differenceInDays, parseISO } from 'date-fns';
import { v4 as uuid } from 'uuid';

import { logger } from '../../../logger';
import { relationshipAnalyticsModule } from '../../analytics';
import { supabaseAdmin } from '../../supabaseClient';
import type { Recommendation, RecommendationContext } from '../types';

/**
 * Generates relationship check-in recommendations
 */
export class RelationshipCheckinGenerator {
  private readonly DAYS_THRESHOLD = 14; // Suggest check-in if not mentioned in 14+ days

  /**
   * Generate relationship check-in recommendations
   */
  async generate(userId: string): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = [];

    try {
      const analytics = await relationshipAnalyticsModule.run(userId);
      const graph = (analytics.graph as any)?.nodes || [];
      const lifecycle = (analytics.charts as any[])?.find(
        (c: any) => c.type === 'lifecycle'
      )?.data || [];

      if (graph.length === 0) return recommendations;

      // Get all entries to find when characters were last mentioned
      const { data: allEntries } = await supabaseAdmin
        .from('journal_entries')
        .select('date, people')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(200);

      if (!allEntries) return recommendations;

      const characterLastMentioned = new Map<string, Date>();
      const now = new Date();

      allEntries.forEach(entry => {
        const entryDate = parseISO(entry.date);
        (entry.people || []).forEach((person: string) => {
          const lastMentioned = characterLastMentioned.get(person);
          if (!lastMentioned || entryDate > lastMentioned) {
            characterLastMentioned.set(person, entryDate);
          }
        });
      });

      // Check top characters
      for (const node of graph.slice(0, 10)) {
        const characterName = node.name || node.id;
        const lastMentioned = characterLastMentioned.get(characterName);

        if (!lastMentioned) continue;

        const daysSince = differenceInDays(now, lastMentioned);
        if (daysSince >= this.DAYS_THRESHOLD) {
          // Check lifecycle phase
          const phase = lifecycle.find(
            (l: any) => l.characterId === node.id || l.characterName === characterName
          );

          const context: RecommendationContext = {
            entity: characterName,
            timeframe: `${daysSince} days ago`,
            confidence: 0.7,
          };

          let description = `You haven't mentioned ${characterName} in ${daysSince} days. How are things?`;
          if (phase && phase.phase === 'decline') {
            description = `Your relationship with ${characterName} seems to be declining. What's happening?`;
          }

          recommendations.push({
            id: uuid(),
            user_id: userId,
            type: 'relationship_checkin',
            title: `Check in with ${characterName}`,
            description,
            context,
            priority: phase?.phase === 'decline' ? 8 : 6,
            confidence: 0.7,
            source_engine: 'relationship_analytics',
            source_data: { character: characterName, days_since: daysSince, phase: phase?.phase },
            status: 'pending',
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
      }
    } catch (error) {
      logger.warn({ error, userId }, 'Failed to generate relationship check-ins');
    }

    return recommendations;
  }
}

