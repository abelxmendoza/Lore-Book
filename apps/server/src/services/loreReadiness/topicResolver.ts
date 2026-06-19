import { lorebookSearchParser, type ParsedLorebookQuery } from '../lorebook/lorebookSearchParser';
import type { BiographySpec } from '../biographyGeneration/types';
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
  };
  topicDomain?: string;
  topicId?: LoreTopicId;
};

export async function resolveCompileTarget(
  userId: string,
  request: LoreReadinessEvaluateRequest
): Promise<ResolvedCompileTarget> {
  if (request.topicId) {
    const topic = getTopicById(request.topicId);
    if (!topic) throw new Error(`Unknown topic: ${request.topicId}`);
    const base = topicIdToDefaultSpec(request.topicId);
    return {
      label: topic.label,
      topicId: request.topicId,
      topicDomain: topic.domain,
      spec: {
        scope: base.scope,
        domain: base.domain,
        tone: 'neutral',
        depth: request.depth ?? 'detailed',
        audience: 'self',
        includeIntrospection: true,
        characterIds: request.characterId ? [request.characterId] : undefined,
        locationIds: request.locationId ? [request.locationId] : undefined,
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
      },
    };
  }

  throw new Error('Provide query, spec, topicId, characterId, or locationId');
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
