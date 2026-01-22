// =====================================================
// SKILL PROFILE CARD
// Purpose: Display skill information in a card format
// =====================================================

import React from 'react';
import { Zap, Star, TrendingUp, Calendar, Award, Sparkles } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { format, parseISO } from 'date-fns';
import type { Skill } from '../../types/skill';

export interface SkillProfileCardProps {
  skill: Skill;
  onClick?: () => void;
  showProgress?: boolean;
}

const CATEGORY_COLORS: Record<string, string> = {
  professional: 'bg-blue-500/20 text-blue-400 border-blue-500/40',
  creative: 'bg-purple-500/20 text-purple-400 border-purple-500/40',
  physical: 'bg-green-500/20 text-green-400 border-green-500/40',
  social: 'bg-pink-500/20 text-pink-400 border-pink-500/40',
  intellectual: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40',
  emotional: 'bg-red-500/20 text-red-400 border-red-500/40',
  practical: 'bg-orange-500/20 text-orange-400 border-orange-500/40',
  artistic: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/40',
  technical: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40',
  other: 'bg-gray-500/20 text-gray-400 border-gray-500/40',
};

const CATEGORY_ICONS: Record<string, typeof Zap> = {
  professional: Award,
  creative: Sparkles,
  physical: TrendingUp,
  social: Star,
  intellectual: Zap,
  emotional: Star,
  practical: Zap,
  artistic: Sparkles,
  technical: Zap,
  other: Zap,
};

export const SkillProfileCard: React.FC<SkillProfileCardProps> = ({
  skill,
  onClick,
  showProgress = true
}) => {
  const CategoryIcon = CATEGORY_ICONS[skill.skill_category] || Zap;
  const categoryColor = CATEGORY_COLORS[skill.skill_category] || CATEGORY_COLORS.other;

  // Calculate level progress
  const currentLevelXP = 100 * Math.pow(1.5, skill.current_level - 1);
  const nextLevelXP = 100 * Math.pow(1.5, skill.current_level);
  const xpInCurrentLevel = skill.total_xp - currentLevelXP;
  const xpNeededForLevel = nextLevelXP - currentLevelXP;
  const levelProgress = Math.min(100, Math.max(0, (xpInCurrentLevel / xpNeededForLevel) * 100));

  const lastPracticed = skill.last_practiced_at ? format(parseISO(skill.last_practiced_at), 'MMM d, yyyy') : 'Never';
  const firstMentioned = format(parseISO(skill.first_mentioned_at), 'MMM d, yyyy');

  return (
    <Card
      className={`bg-gradient-to-br from-black/50 to-black/30 border border-white/10 rounded-xl hover:border-white/20 transition-all cursor-pointer aspect-square flex flex-col ${
        onClick ? 'hover:scale-[1.02]' : ''
      }`}
      onClick={onClick}
    >
      <CardContent className="p-3 sm:p-4 flex flex-col flex-1 min-h-0">
        {/* Skill name - centered at top */}
        <div className="flex flex-col items-center justify-center mb-2 sm:mb-3">
          <div className="flex items-center gap-1.5 justify-center w-full mb-1.5 sm:mb-2">
            <CategoryIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary flex-shrink-0" />
            <h3 className="text-xs sm:text-sm font-semibold text-white break-words hyphens-auto text-center leading-tight" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>{skill.skill_name}</h3>
              {skill.auto_detected && (
              <Badge variant="outline" className="hidden sm:inline-flex text-[10px] px-1 py-0 bg-purple-500/20 border-purple-500/50 text-purple-300 flex-shrink-0">
                  Auto
                </Badge>
              )}
            </div>
          {/* Category badge - centered */}
          <Badge className={`text-[9px] sm:text-[10px] px-1.5 py-0.5 ${categoryColor} capitalize`}>
              {skill.skill_category}
            </Badge>
          </div>

        {/* Level - centered below category */}
        <div className="text-center mb-2 sm:mb-3">
          <div className="text-xs sm:text-lg sm:text-xl font-bold text-primary">Lv {skill.current_level}</div>
          <div className="hidden sm:block text-[10px] text-white/50 mt-0.5">{skill.total_xp.toLocaleString()}</div>
        </div>

        {/* Desktop only: Description */}
        {skill.description && (
          <p className="hidden sm:block text-[10px] sm:text-xs text-white/70 mb-2 line-clamp-2 flex-shrink-0">{skill.description}</p>
        )}

        {/* Desktop only: Progress */}
        {showProgress && (
          <div className="hidden sm:block space-y-1.5 mb-2 flex-shrink-0">
            <div className="flex items-center justify-between text-[10px] text-white/60">
              <span className="truncate mr-1">Lv {skill.current_level + 1}</span>
              <span className="flex-shrink-0">{Math.round(levelProgress)}%</span>
            </div>
            <div className="w-full bg-black/60 rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary/60 to-primary transition-all duration-500"
                style={{ width: `${Math.min(100, levelProgress)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[9px] text-white/40 gap-1">
              <span className="truncate">{xpInCurrentLevel.toLocaleString()}/{xpNeededForLevel.toLocaleString()}</span>
              <span className="flex-shrink-0">{skill.xp_to_next_level.toLocaleString()} XP</span>
            </div>
          </div>
        )}

        {/* Desktop only: Footer */}
        <div className="hidden sm:flex items-center justify-between text-[9px] sm:text-[10px] text-white/50 pt-2 border-t border-white/10 mt-auto gap-1">
          <div className="flex items-center gap-1 truncate min-w-0">
            <Calendar className="h-2.5 w-2.5 flex-shrink-0" />
            <span className="truncate">{firstMentioned}</span>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <Zap className="h-2.5 w-2.5" />
            <span>{skill.practice_count}</span>
          </div>
        </div>

        {/* Desktop only: Last practiced */}
        {skill.last_practiced_at && (
          <div className="hidden sm:block text-[9px] text-white/40 mt-1 truncate">
            Last: {lastPracticed}
          </div>
        )}

        {/* Desktop only: Confidence badge */}
        {skill.confidence_score < 0.7 && (
          <Badge variant="outline" className="hidden sm:inline-flex mt-1.5 text-[9px] px-1.5 py-0.5 bg-yellow-500/20 border-yellow-500/50 text-yellow-300">
            Low ({Math.round(skill.confidence_score * 100)}%)
          </Badge>
        )}
      </CardContent>
    </Card>
  );
};

