// =====================================================
// SKILL NETWORK BUILDER
// Purpose: Build skill networks showing prerequisites, synergies, and learning paths
// =====================================================

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

export type SkillRelationshipType =
  | 'prerequisite_for'
  | 'requires'
  | 'builds_on'
  | 'foundation_for'
  | 'complements'
  | 'synergizes_with'
  | 'related_to'
  | 'specialization_of'
  | 'generalization_of'
  | 'alternative_to'
  | 'evolves_into'
  | 'learned_with'
  | 'practiced_with'
  | 'taught_with'
  | 'transfers_to'
  | 'applies_to';

export type SkillNode = {
  id: string;
  name: string;
  category: string;
  level: number;
  totalXp: number;
  relationships: Array<{
    toId: string;
    relationshipType: SkillRelationshipType;
    confidence: number;
    strength?: number;
    evidence?: string;
  }>;
  metadata?: {
    description?: string;
    first_mentioned_at?: string;
    last_practiced_at?: string;
  };
};

export type SkillNetwork = {
  rootSkill: SkillNode | null;
  skills: Map<string, SkillNode>;
  relationships: Array<{
    fromId: string;
    toId: string;
    type: SkillRelationshipType;
    confidence: number;
    strength?: number;
  }>;
  clusters: Array<{
    id: string;
    name: string;
    skillIds: string[];
    type?: string;
  }>;
  skillCount: number;
  relationshipCount: number;
};

export class SkillNetworkBuilder {
  /**
   * Build skill network for user
   */
  async buildNetwork(
    userId: string,
    rootSkillId?: string,
    maxDepth: number = 3
  ): Promise<SkillNetwork> {
    try {
      // Get all skills
      const { data: skills } = await supabaseAdmin
        .from('skills')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true);

      if (!skills || skills.length === 0) {
        return {
          rootSkill: null,
          skills: new Map(),
          relationships: [],
          clusters: [],
          skillCount: 0,
          relationshipCount: 0,
        };
      }

      // Get all skill relationships
      const { data: relationships } = await supabaseAdmin
        .from('skill_relationships')
        .select('*')
        .eq('user_id', userId)
        .in('from_skill_id', skills.map(s => s.id))
        .or(`to_skill_id.in.(${skills.map(s => s.id).join(',')})`);

      // Get skill clusters
      const { data: clusters } = await supabaseAdmin
        .from('skill_clusters')
        .select('*')
        .eq('user_id', userId);

      // Build skill nodes
      const skillNodes = new Map<string, SkillNode>();
      for (const skill of skills) {
        const skillRels = (relationships || []).filter(
          r => r.from_skill_id === skill.id || r.to_skill_id === skill.id
        );

        const node: SkillNode = {
          id: skill.id,
          name: skill.skill_name,
          category: skill.skill_category,
          level: skill.current_level,
          totalXp: skill.total_xp,
          relationships: skillRels
            .filter(r => r.from_skill_id === skill.id)
            .map(r => ({
              toId: r.to_skill_id,
              relationshipType: r.relationship_type as SkillRelationshipType,
              confidence: r.confidence,
              strength: r.strength,
              evidence: r.metadata?.evidence,
            })),
          metadata: {
            description: skill.description || undefined,
            first_mentioned_at: skill.first_mentioned_at,
            last_practiced_at: skill.last_practiced_at || undefined,
          },
        };

        skillNodes.set(skill.id, node);
      }

      // Determine root skill
      let rootSkill: SkillNode | null = null;
      if (rootSkillId && skillNodes.has(rootSkillId)) {
        rootSkill = skillNodes.get(rootSkillId)!;
      } else if (skills.length > 0) {
        // Use highest level skill or most practiced as root
        const sorted = Array.from(skillNodes.values()).sort(
          (a, b) => b.level - a.level || b.totalXp - a.totalXp
        );
        rootSkill = sorted[0];
      }

      // Build relationships array
      const relsArray = (relationships || []).map(r => ({
        fromId: r.from_skill_id,
        toId: r.to_skill_id,
        type: r.relationship_type as SkillRelationshipType,
        confidence: r.confidence,
        strength: r.strength,
      }));

      // Build clusters array
      const clustersArray = (clusters || []).map(c => ({
        id: c.id,
        name: c.cluster_name,
        skillIds: c.skill_ids || [],
        type: c.cluster_type,
      }));

      return {
        rootSkill,
        skills: skillNodes,
        relationships: relsArray,
        clusters: clustersArray,
        skillCount: skills.length,
        relationshipCount: relationships?.length || 0,
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to build skill network');
      return {
        rootSkill: null,
        skills: new Map(),
        relationships: [],
        clusters: [],
        skillCount: 0,
        relationshipCount: 0,
      };
    }
  }

  /**
   * Detect skill relationships from text
   */
  async detectSkillRelationships(
    userId: string,
    message: string,
    mentionedSkills: Array<{ id: string; name: string }>
  ): Promise<Array<{
    fromSkillId: string;
    toSkillId: string;
    relationshipType: SkillRelationshipType;
    confidence: number;
    evidence: string;
  }>> {
    try {
      if (mentionedSkills.length < 2) {
        return [];
      }

      // Use LLM to detect relationships
      const { config } = await import('../../config');
      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({ apiKey: config.openAiKey });

      const skillList = mentionedSkills.map(s => s.name).join(', ');

      const completion = await openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `Analyze the message to detect relationships between skills.

Skills mentioned: ${skillList}

Relationship types:
- "prerequisite_for": Skill A is required before Skill B (e.g., "JavaScript" → "React")
- "requires": Skill A requires Skill B (same as prerequisite, but from A's perspective)
- "builds_on": Skill A builds on Skill B
- "foundation_for": Skill A is foundation for Skill B
- "complements": Skills that work well together (e.g., "Python" and "SQL")
- "synergizes_with": Skills that enhance each other
- "related_to": Generally related skills
- "specialization_of": Skill A is specialization of Skill B (e.g., "React" → "Frontend Development")
- "generalization_of": Skill A is generalization of Skill B
- "alternative_to": Alternative ways to achieve same goal
- "evolves_into": Skill A naturally evolves into Skill B
- "learned_with": Skills learned together
- "practiced_with": Skills practiced together
- "taught_with": Skills taught together
- "transfers_to": Skill knowledge transfers to another
- "applies_to": Skill applies to another domain

Return JSON:
{
  "relationships": [
    {
      "fromSkill": "skill name",
      "toSkill": "skill name",
      "relationshipType": "prerequisite_for" | "synergizes_with" | etc.,
      "confidence": 0.0-1.0,
      "evidence": "text from message that supports this"
    }
  ]
}

Only include relationships with confidence >= 0.6. Be conservative.`,
          },
          {
            role: 'user',
            content: `Message: "${message}"\n\nDetect skill relationships:`,
          },
        ],
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) {
        return [];
      }

      const parsed = JSON.parse(response);
      const detected: Array<{
        fromSkillId: string;
        toSkillId: string;
        relationshipType: SkillRelationshipType;
        confidence: number;
        evidence: string;
      }> = [];

      for (const rel of parsed.relationships || []) {
        if (rel.confidence >= 0.6) {
          const fromSkill = mentionedSkills.find(
            s => s.name.toLowerCase() === rel.fromSkill.toLowerCase()
          );
          const toSkill = mentionedSkills.find(
            s => s.name.toLowerCase() === rel.toSkill.toLowerCase()
          );

          if (fromSkill && toSkill) {
            detected.push({
              fromSkillId: fromSkill.id,
              toSkillId: toSkill.id,
              relationshipType: rel.relationshipType as SkillRelationshipType,
              confidence: rel.confidence || 0.7,
              evidence: rel.evidence || message,
            });
          }
        }
      }

      // Save detected relationships
      for (const rel of detected) {
        await this.saveSkillRelationship(userId, rel);
      }

      return detected;
    } catch (error) {
      logger.debug({ error }, 'Skill relationship detection failed');
      return [];
    }
  }

  /**
   * Save skill relationship
   */
  async saveSkillRelationship(
    userId: string,
    relationship: {
      fromSkillId: string;
      toSkillId: string;
      relationshipType: SkillRelationshipType;
      confidence: number;
      evidence: string;
    }
  ): Promise<void> {
    try {
      // Check if relationship already exists
      const { data: existing } = await supabaseAdmin
        .from('skill_relationships')
        .select('*')
        .eq('user_id', userId)
        .eq('from_skill_id', relationship.fromSkillId)
        .eq('to_skill_id', relationship.toSkillId)
        .eq('relationship_type', relationship.relationshipType)
        .single();

      if (existing) {
        // Update existing
        await supabaseAdmin
          .from('skill_relationships')
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
        await supabaseAdmin.from('skill_relationships').insert({
          user_id: userId,
          from_skill_id: relationship.fromSkillId,
          to_skill_id: relationship.toSkillId,
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
      logger.error({ error, relationship }, 'Failed to save skill relationship');
    }
  }

  /**
   * Detect and create skill clusters
   */
  async detectSkillClusters(userId: string): Promise<void> {
    try {
      // Get all skills with relationships
      const network = await this.buildNetwork(userId);

      // Group skills by category and relationships
      const clusters = new Map<string, Set<string>>();

      // Cluster by category
      for (const skill of network.skills.values()) {
        const clusterKey = skill.category;
        if (!clusters.has(clusterKey)) {
          clusters.set(clusterKey, new Set());
        }
        clusters.get(clusterKey)!.add(skill.id);
      }

      // Cluster by strong relationships (synergizes_with, learned_with, etc.)
      for (const rel of network.relationships) {
        if (
          rel.type === 'synergizes_with' ||
          rel.type === 'learned_with' ||
          rel.type === 'practiced_with' ||
          (rel.type === 'complements' && (rel.strength || 0) > 0.7)
        ) {
          // Find or create cluster for these skills
          let foundCluster: string | null = null;
          for (const [clusterName, skillIds] of clusters.entries()) {
            if (skillIds.has(rel.fromId) || skillIds.has(rel.toId)) {
              foundCluster = clusterName;
              break;
            }
          }

          if (foundCluster) {
            clusters.get(foundCluster)!.add(rel.fromId);
            clusters.get(foundCluster)!.add(rel.toId);
          } else {
            const clusterName = `Related Skills ${clusters.size + 1}`;
            clusters.set(clusterName, new Set([rel.fromId, rel.toId]));
          }
        }
      }

      // Save clusters
      for (const [clusterName, skillIds] of clusters.entries()) {
        if (skillIds.size >= 2) {
          await supabaseAdmin
            .from('skill_clusters')
            .upsert({
              user_id: userId,
              cluster_name: clusterName,
              skill_ids: Array.from(skillIds),
              cluster_type: 'domain',
              confidence: 0.7,
              evidence_count: 1,
            })
            .eq('user_id', userId)
            .eq('cluster_name', clusterName);
        }
      }
    } catch (error) {
      logger.error({ error, userId }, 'Failed to detect skill clusters');
    }
  }
}

export const skillNetworkBuilder = new SkillNetworkBuilder();
