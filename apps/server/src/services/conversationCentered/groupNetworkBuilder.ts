// =====================================================
// GROUP NETWORK BUILDER
// Purpose: Build group networks showing hierarchies, affiliations, and evolution
// =====================================================

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

export type GroupRelationshipType =
  | 'parent_group_of'
  | 'subgroup_of'
  | 'chapter_of'
  | 'branch_of'
  | 'affiliated_with'
  | 'partner_of'
  | 'competitor_of'
  | 'merged_with'
  | 'split_from'
  | 'succeeded_by'
  | 'overlaps_with'
  | 'exclusive_with'
  | 'recruits_from'
  | 'evolved_from'
  | 'replaced_by'
  | 'predecessor_of';

export type GroupNode = {
  id: string;
  name: string;
  type?: string;
  members: string[];
  relationships: Array<{
    toId: string;
    relationshipType: GroupRelationshipType;
    confidence: number;
    evidence?: string;
    startTime?: string;
    endTime?: string;
  }>;
  attributes?: {
    purpose?: string;
    location?: string;
    frequency?: string;
    status?: string;
    founded_date?: string;
  };
  metadata?: {
    theme?: string;
    cohesion?: number;
    size?: number;
  };
};

export type GroupNetwork = {
  rootGroup: GroupNode | null;
  groups: Map<string, GroupNode>;
  relationships: Array<{
    fromId: string;
    toId: string;
    type: GroupRelationshipType;
    confidence: number;
  }>;
  evolution: Array<{
    groupId: string;
    eventType: string;
    eventDate: string;
    description?: string;
  }>;
  groupCount: number;
  relationshipCount: number;
};

export class GroupNetworkBuilder {
  /**
   * Build group network for user
   */
  async buildNetwork(
    userId: string,
    rootGroupId?: string,
    maxDepth: number = 3
  ): Promise<GroupNetwork> {
    try {
      // Get all groups
      const { data: groups } = await supabaseAdmin
        .from('social_communities')
        .select('*')
        .eq('user_id', userId);

      if (!groups || groups.length === 0) {
        return {
          rootGroup: null,
          groups: new Map(),
          relationships: [],
          evolution: [],
          groupCount: 0,
          relationshipCount: 0,
        };
      }

      // Get all group relationships
      const { data: relationships } = await supabaseAdmin
        .from('group_relationships')
        .select('*')
        .eq('user_id', userId)
        .in('from_group_id', groups.map(g => g.id))
        .or(`to_group_id.in.(${groups.map(g => g.id).join(',')})`);

      // Get group evolution
      const { data: evolution } = await supabaseAdmin
        .from('group_evolution')
        .select('*')
        .eq('user_id', userId)
        .in('group_id', groups.map(g => g.id))
        .order('event_date', { ascending: false });

      // Build group nodes
      const groupNodes = new Map<string, GroupNode>();
      for (const group of groups) {
        const groupRels = (relationships || []).filter(
          r => r.from_group_id === group.id || r.to_group_id === group.id
        );

        const node: GroupNode = {
          id: group.id,
          name: group.community_id,
          type: (group as any).group_type,
          members: group.members || [],
          relationships: groupRels
            .filter(r => r.from_group_id === group.id)
            .map(r => ({
              toId: r.to_group_id,
              relationshipType: r.relationship_type as GroupRelationshipType,
              confidence: r.confidence,
              evidence: r.metadata?.evidence,
              startTime: r.start_time,
              endTime: r.end_time,
            })),
          attributes: {
            purpose: (group as any).purpose,
            location: (group as any).location,
            frequency: (group as any).frequency,
            status: (group as any).status || 'active',
            founded_date: (group as any).founded_date,
          },
          metadata: {
            theme: group.theme,
            cohesion: group.cohesion,
            size: group.size || group.members?.length || 0,
          },
        };

        groupNodes.set(group.id, node);
      }

      // Determine root group
      let rootGroup: GroupNode | null = null;
      if (rootGroupId && groupNodes.has(rootGroupId)) {
        rootGroup = groupNodes.get(rootGroupId)!;
      } else if (groups.length > 0) {
        // Use largest or most cohesive group as root
        const sorted = Array.from(groupNodes.values()).sort(
          (a, b) => (b.metadata?.size || 0) - (a.metadata?.size || 0) ||
            (b.metadata?.cohesion || 0) - (a.metadata?.cohesion || 0)
        );
        rootGroup = sorted[0];
      }

      // Build relationships array
      const relsArray = (relationships || []).map(r => ({
        fromId: r.from_group_id,
        toId: r.to_group_id,
        type: r.relationship_type as GroupRelationshipType,
        confidence: r.confidence,
      }));

      // Build evolution array
      const evolutionArray = (evolution || []).map(e => ({
        groupId: e.group_id,
        eventType: e.event_type,
        eventDate: e.event_date,
        description: e.event_description,
      }));

      return {
        rootGroup,
        groups: groupNodes,
        relationships: relsArray,
        evolution: evolutionArray,
        groupCount: groups.length,
        relationshipCount: relationships?.length || 0,
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to build group network');
      return {
        rootGroup: null,
        groups: new Map(),
        relationships: [],
        evolution: [],
        groupCount: 0,
        relationshipCount: 0,
      };
    }
  }

  /**
   * Detect group relationships from text
   */
  async detectGroupRelationships(
    userId: string,
    message: string,
    mentionedGroups: Array<{ id: string; name: string; members: string[] }>
  ): Promise<Array<{
    fromGroupId: string;
    toGroupId: string;
    relationshipType: GroupRelationshipType;
    confidence: number;
    evidence: string;
  }>> {
    try {
      if (mentionedGroups.length < 2) {
        return [];
      }

      // Use LLM to detect relationships
      const { config } = await import('../../config');
      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({ apiKey: config.openAiKey });

      const groupList = mentionedGroups
        .map(g => `${g.name} (members: ${g.members.join(', ')})`)
        .join('\n');

      const completion = await openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `Analyze the message to detect relationships between groups/communities.

Groups mentioned:
${groupList}

Relationship types:
- "parent_group_of": Group A contains Group B (e.g., "Company" → "Department")
- "subgroup_of": Group B is part of Group A
- "chapter_of": Group B is chapter of Group A
- "branch_of": Group B is branch of Group A
- "affiliated_with": Groups with shared interests
- "partner_of": Groups that collaborate
- "competitor_of": Competing groups
- "merged_with": Groups that merged
- "split_from": Group split from another
- "succeeded_by": Group succeeded by another
- "overlaps_with": Groups with shared members
- "exclusive_with": Groups with no shared members
- "recruits_from": Group A recruits from Group B
- "evolved_from": Group evolved from another
- "replaced_by": Group replaced by another
- "predecessor_of": Group came before another

Return JSON:
{
  "relationships": [
    {
      "fromGroup": "group name",
      "toGroup": "group name",
      "relationshipType": "parent_group_of" | "merged_with" | etc.,
      "confidence": 0.0-1.0,
      "evidence": "text from message that supports this"
    }
  ]
}

Only include relationships with confidence >= 0.6. Be conservative.`,
          },
          {
            role: 'user',
            content: `Message: "${message}"\n\nDetect group relationships:`,
          },
        ],
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) {
        return [];
      }

      const parsed = JSON.parse(response);
      const detected: Array<{
        fromGroupId: string;
        toGroupId: string;
        relationshipType: GroupRelationshipType;
        confidence: number;
        evidence: string;
      }> = [];

      for (const rel of parsed.relationships || []) {
        if (rel.confidence >= 0.6) {
          const fromGroup = mentionedGroups.find(
            g => g.name.toLowerCase() === rel.fromGroup.toLowerCase()
          );
          const toGroup = mentionedGroups.find(
            g => g.name.toLowerCase() === rel.toGroup.toLowerCase()
          );

          if (fromGroup && toGroup) {
            detected.push({
              fromGroupId: fromGroup.id,
              toGroupId: toGroup.id,
              relationshipType: rel.relationshipType as GroupRelationshipType,
              confidence: rel.confidence || 0.7,
              evidence: rel.evidence || message,
            });
          }
        }
      }

      // Save detected relationships
      for (const rel of detected) {
        await this.saveGroupRelationship(userId, rel);
      }

      return detected;
    } catch (error) {
      logger.debug({ error }, 'Group relationship detection failed');
      return [];
    }
  }

  /**
   * Save group relationship
   */
  async saveGroupRelationship(
    userId: string,
    relationship: {
      fromGroupId: string;
      toGroupId: string;
      relationshipType: GroupRelationshipType;
      confidence: number;
      evidence: string;
    }
  ): Promise<void> {
    try {
      // Check if relationship already exists
      const { data: existing } = await supabaseAdmin
        .from('group_relationships')
        .select('*')
        .eq('user_id', userId)
        .eq('from_group_id', relationship.fromGroupId)
        .eq('to_group_id', relationship.toGroupId)
        .eq('relationship_type', relationship.relationshipType)
        .single();

      if (existing) {
        // Update existing
        await supabaseAdmin
          .from('group_relationships')
          .update({
            evidence_count: (existing.evidence_count || 1) + 1,
            confidence: Math.max(existing.confidence, relationship.confidence),
            updated_at: new Date().toISOString(),
            metadata: {
              ...(existing.metadata || {}),
              evidence: relationship.evidence,
              last_detected_at: new Date().toISOString(),
            },
          })
          .eq('id', existing.id);
      } else {
        // Insert new
        await supabaseAdmin.from('group_relationships').insert({
          user_id: userId,
          from_group_id: relationship.fromGroupId,
          to_group_id: relationship.toGroupId,
          relationship_type: relationship.relationshipType,
          confidence: relationship.confidence,
          evidence_count: 1,
          metadata: {
            evidence: relationship.evidence,
            detected_at: new Date().toISOString(),
          },
        });
      }
    } catch (error) {
      if (error && typeof error === 'object' && 'message' in error) {
        const errorMessage = (error as any).message;
        if (errorMessage.includes('duplicate') || errorMessage.includes('unique')) {
          return;
        }
      }
      logger.error({ error, relationship }, 'Failed to save group relationship');
    }
  }

  /**
   * Record group evolution event
   */
  async recordEvolution(
    userId: string,
    groupId: string,
    eventType: string,
    eventDescription: string,
    eventDate: string,
    previousState?: any,
    newState?: any
  ): Promise<void> {
    try {
      await supabaseAdmin.from('group_evolution').insert({
        user_id: userId,
        group_id: groupId,
        event_type: eventType,
        event_description: eventDescription,
        event_date: eventDate,
        previous_state: previousState,
        new_state: newState,
      });
    } catch (error) {
      logger.error({ error, userId, groupId }, 'Failed to record group evolution');
    }
  }
}

export const groupNetworkBuilder = new GroupNetworkBuilder();
