import type { CharacterProfile, RelationshipEdge } from '../../api/characters';

export const CharacterRelationshipGraph = ({
  relationships,
  center
}: {
  relationships: RelationshipEdge[];
  center: CharacterProfile;
}) => (
  <div className="rounded-lg border border-border/40 bg-black/40 p-4 text-sm text-white/70">
    <div className="text-xs uppercase text-white/50">Relationship Graph</div>
    <div className="mt-2 space-y-1">
      {relationships.map((edge) => (
        <div key={`${edge.source}-${edge.target}`} className="flex items-center justify-between rounded bg-white/5 p-2">
          <span>
            {edge.source === center.id ? center.name : edge.source} ➜ {edge.target === center.id ? center.name : edge.target}
          </span>
          <span className="text-primary">{edge.label ?? edge.weight}</span>
        </div>
      ))}
    </div>
  </div>
);
