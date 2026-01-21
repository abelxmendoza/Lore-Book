// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.
// Relationship Update Extractor
// Extracts pros/cons, rankings, and other updates from chat conversations

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { config } from '../../config';

export class RelationshipUpdateExtractor {
  /**
   * Extract and apply relationship updates from conversation
   */
  async extractAndApplyUpdates(
    userId: string,
    relationshipId: string,
    userMessage: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
    assistantResponse: string
  ): Promise<boolean> {
    try {
      // Get current relationship
      const { data: relationship } = await supabaseAdmin
        .from('romantic_relationships')
        .select('*')
        .eq('id', relationshipId)
        .eq('user_id', userId)
        .single();

      if (!relationship) {
        return false;
      }

      // Combine conversation for analysis
      const fullConversation = [
        ...conversationHistory,
        { role: 'user' as const, content: userMessage },
        { role: 'assistant' as const, content: assistantResponse }
      ].map(msg => `${msg.role}: ${msg.content}`).join('\n\n');

      // Extract updates using LLM
      const updates = await this.extractUpdatesWithLLM(
        userId,
        relationshipId,
        relationship,
        fullConversation
      );

      if (!updates || Object.keys(updates).length === 0) {
        return false;
      }

      // Apply updates to database
      await this.applyUpdates(userId, relationshipId, updates);

      return true;
    } catch (error) {
      logger.debug({ error, userId, relationshipId }, 'Failed to extract relationship updates');
      return false;
    }
  }

  /**
   * Extract updates from conversation using LLM
   */
  private async extractUpdatesWithLLM(
    userId: string,
    relationshipId: string,
    relationship: any,
    conversation: string
  ): Promise<{
    pros?: string[];
    cons?: string[];
    redFlags?: string[];
    greenFlags?: string[];
    rankingPreference?: number;
    statusUpdate?: string;
    scoreCorrections?: {
      affection_score?: number;
      compatibility_score?: number;
      relationship_health?: number;
      emotional_intensity?: number;
    };
  } | null> {
    try {
      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({ apiKey: config.openAiKey });

      const currentPros = relationship.pros || [];
      const currentCons = relationship.cons || [];
      const currentRedFlags = relationship.red_flags || [];
      const currentGreenFlags = relationship.green_flags || [];

      const completion = await openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `Analyze this conversation about a romantic relationship and extract any updates the user wants to make.

Current relationship state:
- Type: ${relationship.relationship_type}
- Status: ${relationship.status}
- Pros: ${currentPros.join(', ') || 'None'}
- Cons: ${currentCons.join(', ') || 'None'}
- Red Flags: ${currentRedFlags.join(', ') || 'None'}
- Green Flags: ${currentGreenFlags.join(', ') || 'None'}

Extract updates from the conversation. Return JSON:
{
  "pros": ["new pro 1", "new pro 2"] or null if no changes,
  "cons": ["new con 1", "new con 2"] or null if no changes,
  "redFlags": ["new red flag"] or null if no changes,
  "greenFlags": ["new green flag"] or null if no changes,
  "rankingPreference": 1-10 (if user mentions ranking preference) or null,
  "statusUpdate": "active" | "ended" | "on_break" | "complicated" or null,
  "scoreCorrections": {
    "affection_score": 0.0-1.0 or null,
    "compatibility_score": 0.0-1.0 or null,
    "relationship_health": 0.0-1.0 or null,
    "emotional_intensity": 0.0-1.0 or null
  } or null
}

Only include fields that have clear updates. If user says "add X to pros", include it. If they say "remove Y from cons", exclude it from the new list.
If no updates are detected, return: {"pros": null, "cons": null, "redFlags": null, "greenFlags": null, "rankingPreference": null, "statusUpdate": null, "scoreCorrections": null}`
          },
          {
            role: 'user',
            content: `Conversation:\n${conversation}\n\nExtract relationship updates:`
          }
        ]
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) {
        return null;
      }

      const parsed = JSON.parse(response);
      
      // Clean up the response - only include non-null fields
      const updates: any = {};
      if (parsed.pros !== null && Array.isArray(parsed.pros)) {
        updates.pros = parsed.pros;
      }
      if (parsed.cons !== null && Array.isArray(parsed.cons)) {
        updates.cons = parsed.cons;
      }
      if (parsed.redFlags !== null && Array.isArray(parsed.redFlags)) {
        updates.redFlags = parsed.redFlags;
      }
      if (parsed.greenFlags !== null && Array.isArray(parsed.greenFlags)) {
        updates.greenFlags = parsed.greenFlags;
      }
      if (parsed.rankingPreference !== null && typeof parsed.rankingPreference === 'number') {
        updates.rankingPreference = parsed.rankingPreference;
      }
      if (parsed.statusUpdate !== null && typeof parsed.statusUpdate === 'string') {
        updates.statusUpdate = parsed.statusUpdate;
      }
      if (parsed.scoreCorrections !== null && typeof parsed.scoreCorrections === 'object') {
        updates.scoreCorrections = parsed.scoreCorrections;
      }

      return Object.keys(updates).length > 0 ? updates : null;
    } catch (error) {
      logger.debug({ error }, 'LLM extraction failed');
      return null;
    }
  }

  /**
   * Apply updates to relationship
   */
  private async applyUpdates(
    userId: string,
    relationshipId: string,
    updates: {
      pros?: string[];
      cons?: string[];
      redFlags?: string[];
      greenFlags?: string[];
      rankingPreference?: number;
      statusUpdate?: string;
      scoreCorrections?: {
        affection_score?: number;
        compatibility_score?: number;
        relationship_health?: number;
        emotional_intensity?: number;
      };
    }
  ): Promise<void> {
    const updateData: any = {
      updated_at: new Date().toISOString()
    };

    if (updates.pros) {
      updateData.pros = updates.pros;
    }
    if (updates.cons) {
      updateData.cons = updates.cons;
    }
    if (updates.redFlags) {
      updateData.red_flags = updates.redFlags;
    }
    if (updates.greenFlags) {
      updateData.green_flags = updates.greenFlags;
    }
    if (updates.statusUpdate) {
      updateData.status = updates.statusUpdate;
      updateData.is_current = updates.statusUpdate === 'active';
    }
    if (updates.scoreCorrections) {
      if (updates.scoreCorrections.affection_score !== undefined) {
        updateData.affection_score = updates.scoreCorrections.affection_score;
      }
      if (updates.scoreCorrections.compatibility_score !== undefined) {
        updateData.compatibility_score = updates.scoreCorrections.compatibility_score;
      }
      if (updates.scoreCorrections.relationship_health !== undefined) {
        updateData.relationship_health = updates.scoreCorrections.relationship_health;
      }
      if (updates.scoreCorrections.emotional_intensity !== undefined) {
        updateData.emotional_intensity = updates.scoreCorrections.emotional_intensity;
      }
    }

    // Update relationship
    await supabaseAdmin
      .from('romantic_relationships')
      .update(updateData)
      .eq('id', relationshipId)
      .eq('user_id', userId);

    // If ranking preference was updated, trigger ranking recalculation
    if (updates.rankingPreference) {
      // This will be handled by the ranking service
      logger.debug({ userId, relationshipId, rankingPreference: updates.rankingPreference }, 'Ranking preference updated');
    }

    // Trigger analytics recalculation
    try {
      const { romanticRelationshipAnalytics } = await import('./romanticRelationshipAnalytics');
      await romanticRelationshipAnalytics.generateAnalytics(userId, relationshipId);
    } catch (error) {
      logger.debug({ error }, 'Failed to trigger analytics recalculation');
    }
  }
}

export const relationshipUpdateExtractor = new RelationshipUpdateExtractor();
