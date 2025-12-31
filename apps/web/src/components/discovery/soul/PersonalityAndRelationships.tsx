import { Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Badge } from '../../ui/badge';
import type { EssenceInsight } from '../../../types/essence';

interface PersonalityAndRelationshipsProps {
  personalityTraits: EssenceInsight[];
  relationshipPatterns: EssenceInsight[];
}

/**
 * PersonalityAndRelationships - Split layout showing traits and patterns
 */
export const PersonalityAndRelationships = ({
  personalityTraits,
  relationshipPatterns,
}: PersonalityAndRelationshipsProps) => {
  if (personalityTraits.length === 0 && relationshipPatterns.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Personality Traits */}
      {personalityTraits.length > 0 && (
        <Card className="bg-gradient-to-br from-black/50 to-black/30 border border-white/10 rounded-xl">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-cyan-400" />
                <CardTitle className="text-base font-semibold text-white">Personality Traits</CardTitle>
              </div>
              <Badge variant="outline" className="text-xs border-white/20 text-white/70">
                {personalityTraits.length}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {personalityTraits.map((trait, idx) => (
                <Badge
                  key={idx}
                  variant="outline"
                  className="text-sm border-cyan-400/30 text-cyan-300 bg-cyan-400/10 hover:bg-cyan-400/20 transition-colors cursor-default"
                  title={`Evidence: ${trait.sources?.length || 0} source${(trait.sources?.length || 0) !== 1 ? 's' : ''}. Discuss in chat to refine.`}
                >
                  {trait.text}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Relationship Patterns */}
      {relationshipPatterns.length > 0 && (
        <Card className="bg-gradient-to-br from-black/50 to-black/30 border border-white/10 rounded-xl">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-indigo-400" />
                <CardTitle className="text-base font-semibold text-white">Relationship Patterns</CardTitle>
              </div>
              <Badge variant="outline" className="text-xs border-white/20 text-white/70">
                {relationshipPatterns.length}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {relationshipPatterns.map((pattern, idx) => (
              <div
                key={idx}
                className="p-3 rounded-lg bg-gradient-to-br from-black/40 to-black/20 border border-white/5 hover:border-indigo-400/20 transition-all group"
                title="Discuss this in chat to refine or correct it"
              >
                <p className="text-sm text-white leading-relaxed">{pattern.text}</p>
                <div className="flex items-center gap-2 mt-2 text-xs text-white/40">
                  <div className="h-1 flex-1 bg-black/60 rounded-full overflow-hidden max-w-[100px]">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-400/60 to-indigo-400/40"
                      style={{ width: `${pattern.confidence * 100}%` }}
                    />
                  </div>
                  <span>{pattern.sources?.length || 0} source{(pattern.sources?.length || 0) !== 1 ? 's' : ''}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
