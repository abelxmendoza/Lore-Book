import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';

interface Archetype {
  character: string;
  archetype: string;
  reasoning: string;
}

interface RelationshipArchetypeCardProps {
  archetypes: Archetype[];
}

const ARCHETYPE_COLORS: Record<string, string> = {
  Protector: 'bg-green-500/20 text-green-400 border-green-500/50',
  Antagonist: 'bg-red-500/20 text-red-400 border-red-500/50',
  Chaotic: 'bg-orange-500/20 text-orange-400 border-orange-500/50',
  Important: 'bg-purple-500/20 text-purple-400 border-purple-500/50',
  Peripheral: 'bg-gray-500/20 text-gray-400 border-gray-500/50',
  Supporting: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
};

export const RelationshipArchetypeCard = ({ archetypes }: RelationshipArchetypeCardProps) => {
  if (!archetypes || archetypes.length === 0) {
    return (
      <Card className="bg-black/40 border-border/60">
        <CardHeader>
          <CardTitle className="text-white">Relationship Archetypes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center text-white/40">
            No archetype data available
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-black/40 border-border/60">
      <CardHeader>
        <CardTitle className="text-white">Relationship Archetypes</CardTitle>
        <CardDescription className="text-white/60">
          Character roles and patterns in your relationship network
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {archetypes.map((archetype) => {
            const colorClass = ARCHETYPE_COLORS[archetype.archetype] || ARCHETYPE_COLORS.Supporting;
            return (
              <Card
                key={archetype.character}
                className="bg-black/60 border-border/60 hover:border-primary/50 transition-colors"
              >
                <CardContent className="p-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-white">{archetype.character}</h4>
                      <Badge
                        variant="outline"
                        className={`${colorClass} border`}
                      >
                        {archetype.archetype}
                      </Badge>
                    </div>
                    <p className="text-sm text-white/70 leading-relaxed">
                      {archetype.reasoning}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

