import type { LexicalIntelligenceSpan } from '../../../api/lexicalDebug';

type Props = {
  spanText: string;
  intelligence?: LexicalIntelligenceSpan | null;
  loading?: boolean;
};

export function EntityIntelligenceWhy({ spanText, intelligence, loading }: Props) {
  if (loading) {
    return (
      <div className="mt-2 pt-2 border-t border-white/10" data-testid="entity-intelligence-why">
        <p className="text-[10px] text-white/40">Loading detection details…</p>
      </div>
    );
  }

  if (!intelligence) return null;

  const contextWords = `${intelligence.contextWindow.before} ${intelligence.contextWindow.after}`
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(-5);

  return (
    <div className="mt-2 pt-2 border-t border-white/10 space-y-1.5" data-testid="entity-intelligence-why">
      <p className="text-[10px] uppercase tracking-wide text-white/35">Why highlighted?</p>
      <p className="text-[10px] text-white/60">
        Detected because: {intelligence.detectionSource} → {intelligence.type}
        {intelligence.subtype ? ` / ${intelligence.subtype}` : ''}
        {intelligence.rulesFired?.length ? ` (${intelligence.rulesFired.join(', ')})` : ''}
      </p>
      {contextWords.length > 0 && (
        <p className="text-[10px] text-white/45">
          Context words: {contextWords.map((w) => `"${w}"`).join(', ')}
        </p>
      )}
      {intelligence.alternatives.length > 0 && (
        <p className="text-[10px] text-white/45">
          Alternatives:{' '}
          {intelligence.alternatives
            .slice(0, 3)
            .map((a) => `${a.type} ${Math.round(a.confidence * 100)}%`)
            .join(', ')}
        </p>
      )}
      <p className="text-[10px] text-white/30">
        Confidence {Math.round(intelligence.confidence * 100)}% · {intelligence.status}
      </p>
    </div>
  );
}
