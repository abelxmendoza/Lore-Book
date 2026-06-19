// =====================================================
// SKILL PROFILE CARD — dynamic identity asset, not a dead tag
// =====================================================

import React from 'react';
import { Zap, Star, TrendingUp, Calendar, Award, Sparkles } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { format, parseISO } from 'date-fns';
import type { Skill } from '../../types/skill';
import { monetizationLabel, readSkillProfile, usageLabel } from '../../lib/skillProfile';
import { cn } from '../../lib/cn';

export interface SkillProfileCardProps {
  skill: Skill;
  onClick?: () => void;
  showProgress?: boolean;
  className?: string;
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

function formatLastPracticed(iso: string | null | undefined, compact: boolean): string {
  if (!iso) return 'Never';
  try {
    return format(parseISO(iso), compact ? 'MMM d' : 'MMM d, yyyy');
  } catch {
    return 'Never';
  }
}

export const SkillProfileCard: React.FC<SkillProfileCardProps> = ({
  skill,
  onClick,
  showProgress = true,
  className,
}) => {
  const profile = readSkillProfile(skill.metadata);
  const CategoryIcon = CATEGORY_ICONS[skill.skill_category] || Zap;
  const categoryColor = CATEGORY_COLORS[skill.skill_category] || CATEGORY_COLORS.other;

  const currentLevelXP = 100 * Math.pow(1.5, skill.current_level - 1);
  const nextLevelXP = 100 * Math.pow(1.5, skill.current_level);
  const xpInCurrentLevel = skill.total_xp - currentLevelXP;
  const xpNeededForLevel = nextLevelXP - currentLevelXP;
  const levelProgress = Math.min(100, Math.max(0, (xpInCurrentLevel / xpNeededForLevel) * 100));

  const lastPracticedMobile = formatLastPracticed(skill.last_practiced_at ?? profile?.last_used_at, true);
  const lastPracticedDesktop = formatLastPracticed(skill.last_practiced_at ?? profile?.last_used_at, false);

  const proficiency = profile?.proficiency ?? Math.min(100, skill.current_level * 10 + 20);
  const enjoyment = profile?.enjoyment;

  const stats = [
    { value: `${proficiency}%`, label: 'Prof' },
    { value: `Lv ${skill.current_level}`, label: 'Level' },
    { value: enjoyment != null ? `${enjoyment}%` : '—', label: 'Enjoy' },
  ];

  const metaParts = [
    profile?.usage_frequency ? usageLabel(profile.usage_frequency) : null,
    profile?.trajectory && profile.trajectory !== 'unknown' ? profile.trajectory : null,
  ].filter(Boolean) as string[];

  return (
    <Card
      className={cn(
        'bg-gradient-to-br from-black/50 to-black/30 border border-white/10 rounded-xl hover:border-white/20 transition-all cursor-pointer flex flex-col touch-manipulation active:scale-[0.99] h-full',
        onClick && 'hover:scale-[1.01] sm:hover:scale-[1.02]',
        className,
      )}
      onClick={onClick}
    >
      <CardContent className="p-3 sm:p-4 flex flex-col flex-1 min-h-0 gap-2.5 sm:gap-3 items-center sm:items-stretch text-center sm:text-left">
        {/* Header */}
        <div className="flex flex-col items-center sm:flex-row sm:items-start gap-2 w-full min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 border border-primary/25">
            <CategoryIcon className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 w-full flex-1">
            <h3 className="text-xs sm:text-sm font-semibold text-white leading-snug line-clamp-2">
              {skill.skill_name}
            </h3>
            <div className="flex flex-wrap gap-1 justify-center sm:justify-start mt-1.5">
              <Badge className={cn('text-[8px] sm:text-[9px] px-1.5 py-0 capitalize', categoryColor)}>
                {profile?.skill_type ?? skill.skill_category}
              </Badge>
              {profile?.monetization && (
                <Badge
                  variant="outline"
                  className="text-[8px] px-1.5 py-0 bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                >
                  {monetizationLabel(profile.monetization)}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Stats — equal cells, aligned across cards */}
        <div className="grid grid-cols-3 gap-1 w-full">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="flex flex-col items-center justify-center rounded-md border border-white/10 bg-white/[0.05] py-1.5 px-0.5 min-h-[2.85rem]"
            >
              <span className="text-[11px] sm:text-xs font-bold text-primary tabular-nums leading-none">
                {stat.value}
              </span>
              <span className="text-[8px] sm:text-[9px] text-white/45 mt-1 uppercase tracking-wide leading-none">
                {stat.label}
              </span>
            </div>
          ))}
        </div>

        {(skill.description || profile?.origin_story) && (
          <p className="w-full text-[9px] sm:text-[10px] text-white/55 line-clamp-2 leading-relaxed">
            {skill.description ?? profile?.origin_story}
          </p>
        )}

        {showProgress && (
          <div className="w-full flex-shrink-0">
            <div className="w-full bg-black/60 rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary/70 to-primary"
                style={{ width: `${Math.min(100, levelProgress)}%` }}
              />
            </div>
          </div>
        )}

        {/* Footer meta */}
        <div className="mt-auto w-full flex flex-col items-center sm:items-start gap-1 text-[8px] sm:text-[9px] text-white/50">
          {metaParts.length > 0 && (
            <p className="capitalize leading-none">{metaParts.join(' · ')}</p>
          )}
          <p className="inline-flex items-center justify-center sm:justify-start gap-1 leading-none">
            <Calendar className="h-2.5 w-2.5 shrink-0 text-white/40" />
            <span className="sm:hidden">{lastPracticedMobile}</span>
            <span className="hidden sm:inline">{lastPracticedDesktop}</span>
          </p>
        </div>

        {skill.auto_detected && (
          <Badge
            variant="outline"
            className="text-[8px] px-1.5 py-0 bg-purple-500/15 border-purple-500/40 text-purple-300 self-center sm:self-start"
          >
            Auto-detected
          </Badge>
        )}
      </CardContent>
    </Card>
  );
};
