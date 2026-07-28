import type {
  BookQueryDomain,
  UniversalBookQueryResponse,
} from '@lorebook/api-contracts';

import { queryEngine } from '../../cognition/query/QueryEngine';
import type { TraversalResult } from '../../cognition/query/QueryTypes';

import { isGraphBookQueryRequest } from './bookQueryIntent';

export type BookQueryChatResponse = {
  content: string;
  response_mode: 'BOOK_QUERY' | 'BOOK_QUERY_DEGRADED' | 'BOOK_QUERY_EMPTY' | 'BOOK_QUERY_FAILED';
  confidence: number;
  metadata: Record<string, unknown>;
};

const DOMAIN_LABELS: Record<BookQueryDomain, string> = {
  character: 'People',
  organization: 'Groups & Organizations',
  family: 'Family',
  location: 'Places',
  romance: 'Dating & Romance',
  project: 'Projects',
  skill: 'Skills',
  quest: 'Quests',
  event: 'Life Log',
  document: 'Documents',
  narrative: 'Narrative Anchors',
};

function formatBookQueryResult(response: UniversalBookQueryResponse): string {
  const lines = response.results.slice(0, 15).map((result) => {
    const details = [
      DOMAIN_LABELS[result.domain],
      result.status?.replaceAll('_', ' '),
      result.matchedReasons[0],
    ].filter(Boolean);
    return `- **${result.title}** — ${details.join(' · ')}`;
  });
  const connectionLine = response.connections.length
    ? `\n\nI also found ${response.connections.length} grounded connection${response.connections.length === 1 ? '' : 's'} between those records.`
    : '';
  return `I found ${response.total} grounded record${response.total === 1 ? '' : 's'} across ${response.groups.length} Book${response.groups.length === 1 ? '' : 's'}:\n\n${lines.join('\n')}${connectionLine}`;
}

export async function answerBookQueryForUser(
  userId: string,
  message: string,
): Promise<BookQueryChatResponse> {
  const input = { userId, message };
  const run = await queryEngine.run(input);
  const bookResult = run.results.find((result) => result.source === 'books' && !result.skipped);
  const graphResult = run.results.find((result) => result.source === 'graph' && !result.skipped);
  const response = bookResult?.raw as UniversalBookQueryResponse | undefined;
  const traversal = graphResult?.raw as TraversalResult | undefined;
  const graphPaths = traversal?.paths ?? [];
  const graphContent = graphPaths.slice(0, 8).map((path) =>
    `- ${path.nodes.map((node, index) => {
      const edge = path.edges[index];
      return edge ? `${node.name} —[${edge.type}]→ ` : node.name;
    }).join('')}`).join('\n');

  if (!response && graphPaths.length === 0) {
    return {
      content: 'I recognized that as a Book query, but the Book query system could not complete it.',
      response_mode: 'BOOK_QUERY_FAILED',
      confidence: 0.2,
      metadata: {
        executor: isGraphBookQueryRequest(message) ? 'books+graph' : 'books',
        error: bookResult?.error ?? graphResult?.error ?? 'Book query returned no response',
        queryTrace: {
          intent: run.classification.intent,
          resolvedEntities: run.resolvedEntities,
          confidence: run.merged.confidence,
        },
      },
    };
  }

  if (!response && graphPaths.length > 0) {
    return {
      content: `I found ${graphPaths.length} grounded connection path${graphPaths.length === 1 ? '' : 's'}:\n\n${graphContent}`,
      response_mode: graphResult?.error ? 'BOOK_QUERY_DEGRADED' : 'BOOK_QUERY',
      confidence: graphResult?.confidence ?? 0.75,
      metadata: {
        executor: 'graph',
        graphTraversal: traversal,
        resultCount: graphPaths.length,
        sources: graphResult?.citations ?? [],
        queryTrace: {
          intent: run.classification.intent,
          resolvedEntities: run.resolvedEntities,
          confidence: run.merged.confidence,
        },
      },
    };
  }

  const allDegraded =
    response!.diagnostics.queriedDomains.length > 0
    && response!.diagnostics.degradedDomains.length === response!.diagnostics.queriedDomains.length;

  const commonMetadata = {
    executor: graphPaths.length ? 'books+graph' : 'books',
    bookQuery: response!,
    graphTraversal: traversal,
    queriedBooks: response!.diagnostics.queriedDomains,
    degradedBooks: response!.diagnostics.degradedDomains,
    resultCount: response!.total,
    connectionCount: response!.connections.length + graphPaths.length,
    sources: [
      ...response!.results.flatMap((result) =>
      result.evidence.map((item) => ({
        type: 'entity',
        id: item.sourceId,
        label: item.label,
        sourceTable: item.sourceTable,
        timestamp: item.observedAt ?? undefined,
      }))),
      ...(graphResult?.citations ?? []),
    ],
    queryTrace: {
      intent: run.classification.intent,
      resolvedEntities: run.resolvedEntities,
      confidence: run.merged.confidence,
      contributingSources: run.merged.contributingSources,
    },
  };

  if (allDegraded) {
    return {
      content: `I couldn't search the requested Books because their data sources were unavailable. No answer was invented.`,
      response_mode: 'BOOK_QUERY_FAILED',
      confidence: 0.2,
      metadata: commonMetadata,
    };
  }

  if (response!.total === 0 && graphPaths.length === 0) {
    const labels = response!.diagnostics.queriedDomains.map((domain) => DOMAIN_LABELS[domain]);
    return {
      content: `I searched ${labels.join(', ')} but found no grounded records matching that. No answer was invented.`,
      response_mode: 'BOOK_QUERY_EMPTY',
      confidence: 0.9,
      metadata: commonMetadata,
    };
  }

  const degraded = response!.diagnostics.degradedDomains.length > 0 || Boolean(graphResult?.error);
  const warning = degraded
    ? `\n\nSome query sources could not be searched completely.`
    : '';
  const graphSection = graphPaths.length
    ? `\n\nGrounded connection paths:\n${graphContent}`
    : '';
  return {
    content: `${formatBookQueryResult(response!)}${graphSection}${warning}`,
    response_mode: degraded ? 'BOOK_QUERY_DEGRADED' : 'BOOK_QUERY',
    confidence: degraded ? 0.75 : 0.94,
    metadata: commonMetadata,
  };
}
