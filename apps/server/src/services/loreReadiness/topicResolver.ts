import { lorebookSearchParser, type ParsedLorebookQuery } from '../lorebook/lorebookSearchParser';
import type { BiographySpec } from '../biographyGeneration/types';
import { supabaseAdmin } from '../supabaseClient';
import { getTopicById } from './topics';
import { topicIdToDefaultSpec } from './domainMapping';
import type { LoreReadinessEvaluateRequest, LoreTopicId } from './types';

export type ResolvedCompileTarget = {
  label: string;
  spec: BiographySpec & {
    characterIds?: string[];
    locationIds?: string[];
    eventIds?: string[];
    skillIds?: string[];
    organizationIds?: string[];
  };
  topicDomain?: string;
  topicId?: LoreTopicId;
  organizationNames?: string[];
};

export async function resolveCompileTarget(
  userId: string,
  request: LoreReadinessEvaluateRequest
): Promise<ResolvedCompileTarget> {
  if (request.topicId) {
    const topic = getTopicById(request.topicId);
    if (!topic) throw new Error(`Unknown topic: ${request.topicId}`);
    const base = topicIdToDefaultSpec(request.topicId);

    let organizationNames: string[] | undefined;
    let organizationIds: string[] | undefined;
    let label = topic.label;
    let scope = base.scope;
    let themes = request.themes;

    if (request.organizationId) {
      const { data: org } = await supabaseAdmin
        .from('organizations')
        .select('id, name, aliases')
        .eq('user_id', userId)
        .eq('id', request.organizationId)
        .maybeSingle();
      if (org) {
        organizationIds = [org.id];
        organizationNames = [org.name, ...((org.aliases as string[] | null) ?? [])].filter(Boolean) as string[];
        label = `Your story at ${org.name}`;
        themes = [...(themes ?? []), org.name].filter(Boolean) as string[];
      }
    }

    if (request.skillId) {
      const { data: skill } = await supabaseAdmin
        .from('skills')
        .select('id, skill_name')
        .eq('user_id', userId)
        .eq('id', request.skillId)
        .maybeSingle();
      if (skill) {
        const skillLabel = skill.skill_name || 'skill';
        label = `Your ${skillLabel} journey`;
        themes = [...(themes ?? []), skillLabel, 'learning', 'growth'];
      }
    }

    if (request.threadId) {
      const { data: thread } = await supabaseAdmin
        .from('threads')
        .select('id, name')
        .eq('user_id', userId)
        .eq('id', request.threadId)
        .maybeSingle();
      if (thread?.name) {
        label = `Your story: ${thread.name}`;
        themes = [...(themes ?? []), thread.name];
      }
    }

    if (request.timeRange) {
      scope = 'time_range';
      const year = new Date(request.timeRange.start).getFullYear();
      if (!Number.isNaN(year)) label = `Your ${year} story`;
    }

    if (request.characterId) {
      const { data: character } = await supabaseAdmin
        .from('characters')
        .select('name')
        .eq('user_id', userId)
        .eq('id', request.characterId)
        .maybeSingle();
      if (character?.name) label = `Your story with ${character.name}`;
    }

    if (request.locationId) {
      const { data: location } = await supabaseAdmin
        .from('locations')
        .select('name')
        .eq('user_id', userId)
        .eq('id', request.locationId)
        .maybeSingle();
      if (location?.name) label = `Your story at ${location.name}`;
    }

    return {
      label,
      topicId: request.topicId,
      topicDomain: topic.domain,
      organizationNames,
      spec: {
        scope: request.timeRange ? 'time_range' : scope,
        domain: base.domain,
        timeRange: request.timeRange,
        themes,
        tone: 'neutral',
        depth: request.depth ?? 'detailed',
        audience: 'self',
        includeIntrospection: true,
        characterIds: request.characterId ? [request.characterId] : undefined,
        locationIds: request.locationId ? [request.locationId] : undefined,
        skillIds: request.skillId ? [request.skillId] : undefined,
        organizationIds,
        threadId: request.threadId,
      },
    };
  }

  if (request.characterId) {
    return {
      label: 'Character lorebook',
      spec: {
        scope: 'thematic',
        tone: 'neutral',
        depth: request.depth ?? 'detailed',
        audience: 'self',
        includeIntrospection: true,
        characterIds: [request.characterId],
      },
    };
  }

  if (request.locationId) {
    return {
      label: 'Place lorebook',
      spec: {
        scope: 'thematic',
        tone: 'neutral',
        depth: request.depth ?? 'detailed',
        audience: 'self',
        includeIntrospection: true,
        locationIds: [request.locationId],
      },
    };
  }

  if (request.organizationId) {
    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('id, name, aliases')
      .eq('user_id', userId)
      .eq('id', request.organizationId)
      .maybeSingle();
    const names = org
      ? ([org.name, ...((org.aliases as string[] | null) ?? [])].filter(Boolean) as string[])
      : [];
    return {
      label: org?.name ? `Your story at ${org.name}` : 'Workplace lorebook',
      organizationNames: names,
      spec: {
        scope: 'domain',
        domain: 'professional',
        tone: 'neutral',
        depth: request.depth ?? 'detailed',
        audience: 'self',
        includeIntrospection: true,
        organizationIds: [request.organizationId],
        themes: names,
      },
    };
  }

  if (request.query) {
    const parsed = await lorebookSearchParser.parseQuery(userId, request.query);
    return parsedQueryToTarget(request.query, parsed, request.depth);
  }

  if (request.spec) {
    const spec = request.spec;
    return {
      label: spec.domain ? `${spec.domain} lorebook` : 'Custom lorebook',
      topicDomain: spec.domain,
      spec: {
        scope: spec.scope ?? 'thematic',
        domain: spec.domain,
        timeRange: spec.timeRange,
        themes: spec.themes,
        tone: spec.tone ?? 'neutral',
        depth: request.depth ?? spec.depth ?? 'detailed',
        audience: spec.audience ?? 'self',
        includeIntrospection: spec.includeIntrospection ?? true,
        peopleIds: spec.peopleIds,
        characterIds: spec.characterIds,
        locationIds: spec.locationIds,
        eventIds: spec.eventIds,
        skillIds: spec.skillIds,
        organizationIds: spec.organizationIds,
        threadId: spec.threadId,
      },
    };
  }

  throw new Error('Provide query, spec, topicId, characterId, locationId, or organizationId');
}

function parsedQueryToTarget(
  query: string,
  parsed: ParsedLorebookQuery,
  depth?: 'summary' | 'detailed' | 'epic'
): ResolvedCompileTarget {
  const label = query.trim().slice(0, 80) || 'Custom lorebook';

  const spec: ResolvedCompileTarget['spec'] = {
    scope: mapParsedScope(parsed.scope),
    domain: parsed.domain,
    timeRange: parsed.timeRange,
    themes: parsed.themes,
    tone: parsed.tone ?? 'neutral',
    depth: depth ?? parsed.depth ?? 'detailed',
    audience: parsed.audience ?? 'self',
    includeIntrospection: parsed.includeIntrospection ?? true,
    characterIds: parsed.characterIds,
    locationIds: parsed.locationIds,
    eventIds: parsed.eventIds,
    skillIds: parsed.skillIds,
  };

  return {
    label,
    topicDomain: parsed.domain,
    spec,
  };
}

function mapParsedScope(
  scope: ParsedLorebookQuery['scope']
): BiographySpec['scope'] {
  switch (scope) {
    case 'full_life':
      return 'full_life';
    case 'domain':
      return 'domain';
    case 'time_range':
      return 'time_range';
    default:
      return 'thematic';
  }
}
