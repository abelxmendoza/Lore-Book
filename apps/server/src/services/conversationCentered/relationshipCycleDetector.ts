// =====================================================
// RELATIONSHIP CYCLE DETECTOR
// Purpose: Detect positive and negative relationship loops/cycles
// =====================================================

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

export type CycleType =
  | 'positive_loop'
  | 'negative_loop'
  | 'push_pull'
  | 'hot_cold'
  | 'on_again_off_again'
  | 'conflict_resolution'
  | 'growth_cycle'
  | 'stagnation'
  | 'toxic_pattern';

export interface CycleDetection {
  relationshipId: string;
  cycleType: CycleType;
  cycleStrength: number; // 0-1
  patternDescription: string;
  triggerEvents: string[];
  cycleFrequency: string;
  evidence: string[];
}

export class RelationshipCycleDetector {
  /**
   * Detect cycles for a relationship
   */
  async detectCycles(
    userId: string,
    relationshipId: string,
    personId: string,
    personType: 'character' | 'omega_entity'
  ): Promise<CycleDetection[]> {
    try {
      // Get person name
      let personName = 'Unknown';
      if (personType === 'character') {
        const { data: character } = await supabaseAdmin
          .from('characters')
          .select('name')
          .eq('id', personId)
          .eq('user_id', userId)
          .single();
        personName = character?.name || 'Unknown';
      } else {
        const { data: entity } = await supabaseAdmin
          .from('omega_entities')
          .select('primary_name')
          .eq('id', personId)
          .eq('user_id', userId)
          .single();
        personName = entity?.primary_name || 'Unknown';
      }

      // Get all mentions over last 90 days
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const { data: mentions } = await supabaseAdmin
        .from('journal_entries')
        .select('id, created_at, content')
        .eq('user_id', userId)
        .gte('created_at', ninetyDaysAgo.toISOString())
        .ilike('content', `%${personName}%`)
        .order('created_at', { ascending: true });

      const { data: messages } = await supabaseAdmin
        .from('omega_messages')
        .select('id, created_at, content')
        .eq('user_id', userId)
        .gte('created_at', ninetyDaysAgo.toISOString())
        .ilike('content', `%${personName}%`)
        .order('created_at', { ascending: true });

      const allMentions = [
        ...(mentions || []),
        ...(messages || []),
      ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      if (allMentions.length < 5) {
        return []; // Need at least 5 mentions to detect patterns
      }

      // Use LLM to detect cycles
      const { config } = await import('../../config');
      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({ apiKey: config.openAiKey });

      const mentionTimeline = allMentions
        .map(m => `[${new Date(m.created_at).toLocaleDateString()}] ${m.content.substring(0, 150)}`)
        .join('\n');

      const completion = await openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `Analyze this relationship timeline to detect cycles and patterns.

Cycle types:
- "positive_loop": Repeating positive patterns (e.g., consistent good times, mutual support)
- "negative_loop": Repeating negative patterns (e.g., same fights, same issues)
- "push_pull": Push-pull dynamic (getting close then pulling away)
- "hot_cold": Hot and cold behavior (affectionate then distant)
- "on_again_off_again": Breaking up and getting back together repeatedly
- "conflict_resolution": Cycle of conflict followed by resolution
- "growth_cycle": Positive growth patterns repeating
- "stagnation": Relationship stuck in same patterns without growth
- "toxic_pattern": Toxic or unhealthy repeating patterns

Return JSON:
{
  "cycles": [
    {
      "cycleType": "negative_loop" | "positive_loop" | etc.,
      "cycleStrength": 0.0-1.0,
      "patternDescription": "description of the pattern",
      "triggerEvents": ["what triggers this", "another trigger"],
      "cycleFrequency": "daily" | "weekly" | "monthly" | "irregular",
      "evidence": ["quote 1", "quote 2"]
    }
  ]
}

Only include cycles with strength >= 0.6. Be specific about patterns.`,
          },
          {
            role: 'user',
            content: `Timeline of mentions about ${personName}:\n\n${mentionTimeline}\n\nDetect relationship cycles:`,
          },
        ],
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) {
        return [];
      }

      const parsed = JSON.parse(response);
      const detections: CycleDetection[] = [];

      for (const cycle of parsed.cycles || []) {
        if (cycle.cycleStrength >= 0.6) {
          // Save cycle
          await supabaseAdmin
            .from('relationship_cycles')
            .upsert({
              user_id: userId,
              relationship_id: relationshipId,
              cycle_type: cycle.cycleType,
              cycle_strength: cycle.cycleStrength,
              cycle_frequency: cycle.cycleFrequency || 'irregular',
              pattern_description: cycle.patternDescription,
              trigger_events: cycle.triggerEvents || [],
              evidence: cycle.evidence || [],
              is_active: true,
              observation_count: 1,
              last_observed_at: new Date().toISOString(),
              metadata: {
                detected_at: new Date().toISOString(),
              },
            })
            .eq('user_id', userId)
            .eq('relationship_id', relationshipId)
            .eq('cycle_type', cycle.cycleType);

          detections.push({
            relationshipId,
            cycleType: cycle.cycleType as CycleType,
            cycleStrength: cycle.cycleStrength,
            patternDescription: cycle.patternDescription,
            triggerEvents: cycle.triggerEvents || [],
            cycleFrequency: cycle.cycleFrequency || 'irregular',
            evidence: cycle.evidence || [],
          });
        }
      }

      return detections;
    } catch (error) {
      logger.error({ error, relationshipId }, 'Failed to detect cycles');
      return [];
    }
  }

  /**
   * Update cycle observation count
   */
  async updateCycleObservation(
    userId: string,
    relationshipId: string,
    cycleType: CycleType
  ): Promise<void> {
    try {
      const { data: existing } = await supabaseAdmin
        .from('relationship_cycles')
        .select('*')
        .eq('user_id', userId)
        .eq('relationship_id', relationshipId)
        .eq('cycle_type', cycleType)
        .single();

      if (existing) {
        await supabaseAdmin
          .from('relationship_cycles')
          .update({
            observation_count: (existing.observation_count || 1) + 1,
            last_observed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
      }
    } catch (error) {
      logger.debug({ error }, 'Failed to update cycle observation');
    }
  }
}

export const relationshipCycleDetector = new RelationshipCycleDetector();
