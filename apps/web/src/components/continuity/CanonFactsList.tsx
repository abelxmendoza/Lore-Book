import type { CanonFact } from '../../api/continuity';

export const CanonFactsList = ({ facts }: { facts: CanonFact[] }) => (
  <div className="space-y-2 rounded-lg border border-cyan/30 bg-white/5 p-4">
    <div className="text-xs uppercase text-white/50">Canon Facts</div>
    {facts.map((fact) => (
      <div key={fact.id} className="flex items-center justify-between text-sm text-white/80">
        <span>{fact.description}</span>
        <span className="text-primary">{Math.round(fact.confidence * 100)}%</span>
      </div>
    ))}
  </div>
);
