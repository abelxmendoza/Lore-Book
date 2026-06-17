import { BookOpen, Sparkles } from 'lucide-react';
import { Badge } from '../ui/badge';
import {
  getMockRomanticGlossaryCues,
  getMockRomanticLexicalInsights,
  type MockLexicalInsight,
} from '../../mocks/romanticLexicalInsights';
import type { RomanticRescanSummary } from '../../api/romanticRelationships';

type Props = {
  demoMode?: boolean;
  rescanSummary?: RomanticRescanSummary | null;
  relationships?: Array<{
    person_name?: string;
    relationship_type?: string;
    metadata?: {
      lexical_evidence?: string;
      glossary_cues?: string[];
      ontology_tags?: string[];
    } & Record<string, unknown>;
  }>;
};

function insightsFromRelationships(
  relationships: Props['relationships']
): MockLexicalInsight[] {
  if (!relationships?.length) return [];
  return relationships
    .filter((r) => r.metadata?.lexical_evidence || r.metadata?.glossary_cues?.length)
    .map((r, i) => ({
      id: `rel-insight-${i}`,
      partnerName: r.person_name ?? 'Unknown',
      relationshipType: r.relationship_type ?? 'dating',
      cue: r.metadata?.glossary_cues?.[0] ?? r.relationship_type ?? 'romantic',
      snippet: (r.metadata?.lexical_evidence as string) ?? '',
      ontologyTag: r.metadata?.ontology_tags?.[0] ?? 'CONCEPT/RELATIONSHIP_VERB',
      confidence: 0.8,
    }))
    .slice(0, 8);
}

function insightsFromRescan(summary: RomanticRescanSummary): MockLexicalInsight[] {
  return (summary.lexicalHits ?? []).map((hit, i) => ({
    id: `rescan-${i}`,
    partnerName: hit.partnerName,
    relationshipType: hit.relationshipType,
    cue: hit.cues[0] ?? hit.relationshipType,
    snippet: hit.evidence,
    ontologyTag: hit.ontologyTags[0] ?? 'CONCEPT/RELATIONSHIP_VERB',
    confidence: hit.confidence,
  }));
}

export const RomanticLexicalInsights = ({
  demoMode = false,
  rescanSummary,
  relationships = [],
}: Props) => {
  const insights = demoMode
    ? getMockRomanticLexicalInsights()
    : rescanSummary?.lexicalHits?.length
      ? insightsFromRescan(rescanSummary)
      : insightsFromRelationships(relationships);

  const glossaryCues = demoMode ? getMockRomanticGlossaryCues() : [];

  if (!demoMode && insights.length === 0 && !rescanSummary) return null;

  return (
    <div className="rounded-lg border border-purple-500/25 bg-gradient-to-br from-purple-950/25 via-black/40 to-pink-950/20 overflow-hidden">
      <div className="flex items-center gap-2 px-3 sm:px-4 py-2.5 border-b border-purple-500/15">
        <BookOpen className="h-4 w-4 text-purple-300 flex-shrink-0" />
        <h3 className="text-sm sm:text-base font-semibold text-white">
          Lexical intelligence
        </h3>
        <Badge variant="outline" className="text-[9px] bg-purple-500/15 text-purple-200 border-purple-500/25">
          Glossary + ontology
        </Badge>
        {demoMode && (
          <Badge variant="outline" className="text-[9px] bg-yellow-500/15 text-yellow-200 border-yellow-500/25 ml-auto">
            Demo
          </Badge>
        )}
      </div>

      <div className="px-3 sm:px-4 py-3 space-y-3">
        {rescanSummary && !demoMode && (
          <p className="text-[11px] text-emerald-200/90 rounded border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
            Parsed {rescanSummary.romanticEpisodes} romantic episode
            {rescanSummary.romanticEpisodes === 1 ? '' : 's'} across{' '}
            {rescanSummary.scannedEpisodes} messages — {rescanSummary.glossaryCuesMatched} glossary
            cue{rescanSummary.glossaryCuesMatched === 1 ? '' : 's'}, {rescanSummary.relationshipsUpserted}{' '}
            relationship{rescanSummary.relationshipsUpserted === 1 ? '' : 's'} updated.
          </p>
        )}

        {demoMode && (
          <p className="text-[11px] text-purple-200/70 leading-relaxed">
            LoreBook reads love/relationship language from your chats using the ontology glossary — before any LLM runs.
            Each snippet below shows the cue that triggered detection and the partner it mapped to.
          </p>
        )}

        {glossaryCues.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {glossaryCues.map((c) => (
              <span
                key={c.cue}
                className="text-[9px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-200/80 border border-purple-500/20"
                title={`${c.category} → ${c.hint}`}
              >
                {c.cue}
              </span>
            ))}
          </div>
        )}

        <div className="space-y-2">
          {insights.map((insight) => (
            <div
              key={insight.id}
              className="rounded-lg border border-white/8 bg-black/30 px-3 py-2.5"
            >
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <Sparkles className="h-3 w-3 text-pink-300/80" />
                <span className="text-xs font-medium text-white">{insight.partnerName}</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-pink-500/15 text-pink-200/90 border border-pink-500/20">
                  {insight.cue}
                </span>
                <span className="text-[9px] text-white/35 ml-auto font-mono">
                  {Math.round(insight.confidence * 100)}%
                </span>
              </div>
              <p className="text-[11px] text-white/50 leading-relaxed italic line-clamp-2">
                {insight.snippet}
              </p>
              <p className="text-[9px] text-white/30 mt-1 font-mono">{insight.ontologyTag}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
