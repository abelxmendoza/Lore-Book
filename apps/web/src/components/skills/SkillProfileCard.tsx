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
      className={`bg-gradient-to-br from-black/50 to-black/30 border border-white/10 rounded-xl hover:border-white/20 transition-all cursor-pointer ${
        onClick ? 'hover:scale-[1.02]' : ''
      }`}
      onClick={onClick}
    >
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <CategoryIcon className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold text-white">{skill.skill_name}</h3>
              {skill.auto_detected && (
                <Badge variant="outline" className="text-xs bg-purple-500/20 border-purple-500/50 text-purple-300">
                  Auto
                </Badge>
              )}
            </div>
            <Badge className={`text-xs ${categoryColor} capitalize`}>
              {skill.skill_category}
            </Badge>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-primary">Lv {skill.current_level}</div>
            <div className="text-xs text-white/50">{skill.total_xp.toLocaleString()} XP</div>
          </div>
        </div>

        {skill.description && (
          <p className="text-sm text-white/70 mb-4 line-clamp-2">{skill.description}</p>
        )}

        {showProgress && (
          <div className="space-y-2 mb-4">
            <div className="flex items-center justify-between text-xs text-white/60">
              <span>Progress to Level {skill.current_level + 1}</span>
              <span>{Math.round(levelProgress)}%</span>
            </div>
            <div className="w-full bg-black/60 rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary/60 to-primary transition-all duration-500"
                style={{ width: `${Math.min(100, levelProgress)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-white/40">
              <span>{xpInCurrentLevel.toLocaleString()} / {xpNeededForLevel.toLocaleString()} XP</span>
              <span>{skill.xp_to_next_level.toLocaleString()} XP to next level</span>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-white/50 pt-3 border-t border-white/10">
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            <span>First: {firstMentioned}</span>
          </div>
          <div className="flex items-center gap-1">
            <Zap className="h-3 w-3" />
            <span>{skill.practice_count} practice{skill.practice_count !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {skill.last_practiced_at && (
          <div className="text-xs text-white/40 mt-2">
            Last practiced: {lastPracticed}
          </div>
        )}

        {skill.confidence_score < 0.7 && (
          <Badge variant="outline" className="mt-2 text-xs bg-yellow-500/20 border-yellow-500/50 text-yellow-300">
            Low confidence ({Math.round(skill.confidence_score * 100)}%)
          </Badge>
        )}
      </CardContent>
    </Card>
  );
};

