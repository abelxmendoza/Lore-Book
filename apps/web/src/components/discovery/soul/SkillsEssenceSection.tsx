import { Zap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Badge } from '../../ui/badge';
import type { SkillInsight } from '../../../types/essence';

interface SkillsEssenceSectionProps {
  skills: SkillInsight[];
}

/**
 * SkillsEssenceSection - Narrative skills view (not gamified)
 * Shows skills as part of identity, not progression
 */
export const SkillsEssenceSection = ({ skills }: SkillsEssenceSectionProps) => {
  if (!skills || skills.length === 0) {
    return (
      <Card className="bg-gradient-to-br from-black/50 to-black/30 border border-white/10 rounded-xl">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-400" />
            <CardTitle className="text-base font-semibold text-white">Your Skills</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-white/40 italic">Still discovering your skills...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-gradient-to-br from-black/50 to-black/30 border border-white/10 rounded-xl">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-400" />
            <CardTitle className="text-base font-semibold text-white">Your Skills</CardTitle>
          </div>
          <Badge variant="outline" className="text-xs border-white/20 text-white/70">
            {skills.length} skills
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {skills.map((skill, idx) => {
          const isHighConfidence = skill.confidence >= 0.85;
          const hasStrongEvidence = (skill.evidence?.length || 0) >= 3;
          
          return (
            <div
              key={idx}
              className={`p-4 rounded-lg transition-all group ${
                isHighConfidence && hasStrongEvidence
                  ? 'bg-gradient-to-br from-yellow-400/10 to-yellow-400/5 border border-yellow-400/30 shadow-sm shadow-yellow-400/10'
                  : isHighConfidence
                  ? 'bg-gradient-to-br from-black/50 to-black/30 border border-yellow-400/20'
                  : 'bg-gradient-to-br from-black/40 to-black/20 border border-white/5'
              } hover:border-yellow-400/30 hover:shadow-md`}
              title="Discuss this in chat to refine or correct it"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`font-semibold text-sm ${
                    isHighConfidence ? 'text-white' : 'text-white/90'
                  }`}>{skill.skill}</span>
                  {isHighConfidence && hasStrongEvidence && (
                    <span className="px-1.5 py-0.5 bg-yellow-400/20 text-yellow-400 rounded text-[10px] font-medium">
                      Strong
                    </span>
                  )}
                </div>
                <div className="h-1.5 w-24 bg-black/60 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      isHighConfidence
                        ? 'bg-gradient-to-r from-yellow-400 via-yellow-400/90 to-yellow-400/70'
                        : 'bg-gradient-to-r from-yellow-400/60 to-yellow-400/40'
                    }`}
                    style={{ width: `${skill.confidence * 100}%` }}
                  />
                </div>
              </div>
            {skill.evidence && skill.evidence.length > 0 && (
              <div className="space-y-1 mt-3">
                <p className="text-xs text-white/50 font-medium">
                  Supported by {skill.evidence.length} evidence point{skill.evidence.length !== 1 ? 's' : ''}:
                </p>
                {skill.evidence.slice(0, 2).map((quote, quoteIdx) => (
                  <p key={quoteIdx} className={`text-xs italic pl-2 border-l-2 ${
                    hasStrongEvidence
                      ? 'text-white/70 border-yellow-400/30'
                      : 'text-white/60 border-yellow-400/20'
                  }`}>
                    "{quote}"
                  </p>
                ))}
                {skill.evidence.length > 2 && (
                  <p className="text-xs text-white/40 italic">...and {skill.evidence.length - 2} more</p>
                )}
              </div>
            )}
            <div className="text-xs text-white/30 mt-3 italic opacity-0 group-hover:opacity-100 transition-opacity">
              Talk about this in chat to refine it
            </div>
          </div>
        );
        })}
      </CardContent>
    </Card>
  );
};
