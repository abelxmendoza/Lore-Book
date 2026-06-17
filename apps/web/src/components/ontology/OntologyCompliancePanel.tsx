import { useState } from 'react';
import { BookOpen, CheckCircle2, ChevronDown, ChevronUp, Sparkles, AlertTriangle } from 'lucide-react';
import { Badge } from '../ui/badge';
import { inferenceApi } from '../../api/inference';
import { useOntologyCompliance } from '../../hooks/useOntologyCompliance';
import type { ComplianceBook } from '../../api/ontologyCompliance';

type Props = {
  book: ComplianceBook;
  /** Hide when healthy (default true). */
  hideWhenHealthy?: boolean;
};

const BOOK_LABEL: Record<ComplianceBook, string> = {
  characters: 'Character Book',
  locations: 'Places Book',
  organizations: 'Organizations Book',
};

export function OntologyCompliancePanel({ book, hideWhenHealthy = true }: Props) {
  const { report, issues, issueCount, errorCount, healthy, loading, refresh } = useOntologyCompliance(book);
  const [expanded, setExpanded] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [fixNote, setFixNote] = useState<string | null>(null);

  if (hideWhenHealthy && healthy && !loading) return null;
  if (!report && !loading && !healthy) return null;

  const runFix = async () => {
    if (!report) return;
    setFixing(true);
    setFixNote(null);
    try {
      const result = await inferenceApi.sync({ tier: report.recommendedFix.tier });
      const ran = result.report?.ran?.join(', ') ?? 'done';
      setFixNote(`Inference ran: ${ran}`);
      await refresh();
      window.dispatchEvent(new CustomEvent('lk:inference-complete', { detail: result.report }));
    } catch {
      setFixNote('Inference sync failed — try again from settings');
    } finally {
      setFixing(false);
    }
  };

  const severityColor = errorCount > 0 ? 'border-amber-500/30 bg-amber-950/20' : 'border-teal-500/25 bg-teal-950/15';

  return (
    <div className={`rounded-lg border overflow-hidden ${healthy ? 'border-emerald-500/25 bg-emerald-950/15' : severityColor}`}>
      <div className="flex items-start gap-2 px-3 sm:px-4 py-2.5">
        {healthy ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0 mt-0.5" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-amber-300 flex-shrink-0 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-white flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5 text-purple-300" />
              Lexical compliance
            </h3>
            <Badge variant="outline" className="text-[9px] bg-purple-500/10 text-purple-200 border-purple-500/25">
              Glossary + ontology
            </Badge>
            {loading && (
              <span className="text-[10px] text-white/40">Checking…</span>
            )}
            {!loading && healthy && (
              <Badge variant="outline" className="text-[9px] text-emerald-200 border-emerald-500/30">
                All rules pass
              </Badge>
            )}
            {!loading && !healthy && (
              <Badge variant="outline" className="text-[9px] text-amber-200 border-amber-500/30">
                {issueCount} issue{issueCount === 1 ? '' : 's'}
                {errorCount > 0 ? ` · ${errorCount} critical` : ''}
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-white/45 mt-1 leading-relaxed">
            {healthy
              ? `${BOOK_LABEL[book]} entities match lexical intelligence rules (classifier, hierarchy, name quality).`
              : `${BOOK_LABEL[book]} has entities that break ontology rules — wrong book, bad hierarchy, or junk names.`}
          </p>
        </div>
        {issueCount > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-white/40 hover:text-white/70 p-1"
            aria-expanded={expanded}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        )}
      </div>

      {expanded && issueCount > 0 && (
        <ul className="border-t border-white/10 px-3 sm:px-4 py-2 space-y-1.5 max-h-48 overflow-y-auto">
          {issues.slice(0, 12).map((issue) => (
            <li key={`${issue.id}-${issue.rule}`} className="text-[11px] text-white/70">
              <span className="font-medium text-white/90">{issue.name}</span>
              <span className="text-white/35"> — </span>
              {issue.issue}
              <span className="ml-1 font-mono text-[9px] text-white/25">{issue.rule}</span>
            </li>
          ))}
          {issues.length > 12 && (
            <li className="text-[10px] text-white/35">+{issues.length - 12} more</li>
          )}
        </ul>
      )}

      {!healthy && report && (
        <div className="border-t border-white/10 px-3 sm:px-4 py-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={fixing}
            onClick={() => void runFix()}
            className="inline-flex items-center gap-1.5 rounded-md bg-purple-600/80 hover:bg-purple-500/80 disabled:opacity-50 px-2.5 py-1 text-[11px] font-medium text-white transition-colors"
          >
            <Sparkles className={`h-3 w-3 ${fixing ? 'animate-pulse' : ''}`} />
            {fixing ? 'Running…' : report.recommendedFix.label}
          </button>
          {fixNote && <span className="text-[10px] text-white/45">{fixNote}</span>}
        </div>
      )}
    </div>
  );
}
