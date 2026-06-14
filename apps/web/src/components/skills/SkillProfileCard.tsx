// =====================================================
// SKILL PROFILE CARD — dynamic identity asset, not a dead tag
// =====================================================

import React from 'react';
import { Zap, Star, TrendingUp, Calendar, Award, Sparkles, Briefcase, Heart } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { format, parseISO } from 'date-fns';
import type { Skill } from '../../types/skill';
import { monetizationLabel, readSkillProfile, usageLabel } from '../../lib/skillProfile';

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
  showProgress = true,
}) => {
  const profile = readSkillProfile(skill.metadata);
  const CategoryIcon = CATEGORY_ICONS[skill.skill_category] || Zap;
  const categoryColor = CATEGORY_COLORS[skill.skill_category] || CATEGORY_COLORS.other;

  const currentLevelXP = 100 * Math.pow(1.5, skill.current_level - 1);
  const nextLevelXP = 100 * Math.pow(1.5, skill.current_level);
  const xpInCurrentLevel = skill.total_xp - currentLevelXP;
  const xpNeededForLevel = nextLevelXP - currentLevelXP;
  const levelProgress = Math.min(100, Math.max(0, (xpInCurrentLevel / xpNeededForLevel) * 100));

  const lastPracticed = skill.last_practiced_at
    ? format(parseISO(skill.last_practiced_at), 'MMM d, yyyy')
    : profile?.last_used_at
      ? format(parseISO(profile.last_used_at), 'MMM d, yyyy')
      : 'Never';

  const proficiency = profile?.proficiency ?? Math.min(100, skill.current_level * 10 + 20);
  const enjoyment = profile?.enjoyment;

  return (
    <Card
      className={`bg-gradient-to-br from-black/50 to-black/30 border border-white/10 rounded-xl hover:border-white/20 transition-all cursor-pointer min-h-[180px] flex flex-col ${
        onClick ? 'hover:scale-[1.02]' : ''
      }`}
      onClick={onClick}
    >
      <CardContent className="p-3 sm:p-4 flex flex-col flex-1 min-h-0">
        <div className="flex flex-col items-center mb-2">
          <div className="flex items-center gap-1.5 justify-center w-full mb-1">
            <CategoryIcon className="h-3.5 w-3.5 text-primary flex-shrink-0" />
            <h3 className="text-xs sm:text-sm font-semibold text-white text-center leading-tight line-clamp-2">
              {skill.skill_name}
            </h3>
          </div>
          <div className="flex flex-wrap justify-center gap-1 mt-1">
            <Badge className={`text-[9px] px-1.5 py-0.5 ${categoryColor} capitalize`}>
              {profile?.skill_type ?? skill.skill_category}
            </Badge>
            {profile?.monetization && (
              <Badge variant="outline" className="text-[8px] px-1 py-0 bg-emerald-500/10 border-emerald-500/30 text-emerald-300">
                {monetizationLabel(profile.monetization)}
              </Badge>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1 text-center mb-2 text-[10px]">
          <div>
            <div className="text-primary font-bold">{proficiency}%</div>
            <div className="text-white/40">Proficiency</div>
          </div>
          <div>
            <div className="text-primary font-bold">Lv {skill.current_level}</div>
            <div className="text-white/40">Level</div>
          </div>
          <div>
            <div className="text-primary font-bold">{enjoyment != null ? `${enjoyment}%` : '—'}</div>
            <div className="text-white/40 flex items-center justify-center gap-0.5">
              <Heart className="h-2 w-2" /> Enjoy
            </div>
          </div>
        </div>

        {skill.description && (
          <p className="text-[10px] text-white/60 line-clamp-2 mb-2 text-center">{skill.description}</p>
        )}
        {profile?.origin_story && (
          <p className="text-[9px] text-white/40 line-clamp-2 mb-2 italic text-center">{profile.origin_story}</p>
        )}

        {showProgress && (
          <div className="space-y-1 mb-2 flex-shrink-0">
            <div className="w-full bg-black/60 rounded-full h-1 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary/60 to-primary"
                style={{ width: `${Math.min(100, levelProgress)}%` }}
              />
            </div>
          </div>
        )}

        <div className="mt-auto flex flex-wrap justify-center gap-1.5 text-[9px] text-white/45">
          {profile?.usage_frequency && (
            <span>{usageLabel(profile.usage_frequency)}</span>
          )}
          {profile?.trajectory && profile.trajectory !== 'unknown' && (
            <span className="capitalize">{profile.trajectory}</span>
          )}
          <span className="flex items-center gap-0.5">
            <Calendar className="h-2.5 w-2.5" />
            {lastPracticed}
          </span>
        </div>

        {skill.auto_detected && (
          <Badge variant="outline" className="mt-1.5 mx-auto text-[8px] px-1 py-0 bg-purple-500/15 border-purple-500/40 text-purple-300">
            Auto-detected
          </Badge>
        )}
      </CardContent>
    </Card>
  );
};
