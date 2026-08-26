// =====================================================
// SKILL PROFILE CARD — browse tile: only glanceable skill facts
// Deep detail (certainty, evidence, story, links) lives in the modal.
// =====================================================

import React from 'react';
import { ChevronRight } from 'lucide-react';
import type { Skill } from '../../types/skill';
import { readSkillProfile } from '../../lib/skillProfile';
import { skillCategoryTheme } from '../../lib/skillCategoryTheme';
import { cn } from '../../lib/cn';
import {
  formatLastUsed,
  levelLabel,
  skillStatus,
  statusLabel,
  usageCountLabel,
} from '../../lib/skillStory';

export interface SkillProfileCardProps {
  skill: Skill;
  onClick?: () => void;
  /** @deprecated Progress bars belong in the modal; kept for call-site compat. */
  showProgress?: boolean;
  className?: string;
  selected?: boolean;
  selectionMode?: boolean;
}

function levelProgressPct(skill: Skill): number | null {
  const level = Math.max(1, skill.current_level);
  const floor = 100 * Math.pow(1.5, level - 1);
  const ceiling = 100 * Math.pow(1.5, level);
  const span = ceiling - floor;
  if (span <= 0) return null;
  return Math.min(100, Math.max(0, ((skill.total_xp - floor) / span) * 100));
}

export const SkillProfileCard: React.FC<SkillProfileCardProps> = ({
  skill,
  onClick,
  className,
  selected = false,
  selectionMode = false,
}) => {
  const profile = readSkillProfile(skill.metadata);
  const theme = skillCategoryTheme(skill.skill_category);
  const status = skillStatus(skill, profile);
  const blurb = (profile?.story_summary || skill.description || profile?.origin_story || '').trim();
  const progress = levelProgressPct(skill);
  const lastUsed = formatLastUsed(skill.last_practiced_at, profile);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative w-full min-h-[9.5rem] text-left rounded-xl border bg-gradient-to-br transition-all duration-200 overflow-hidden flex flex-col touch-manipulation active:scale-[0.98] hover:shadow-lg',
        theme.bodyGrad,
        theme.border,
        theme.hoverBorder,
        theme.hoverShadow,
        selected && 'ring-1 ring-primary/50 border-primary/60',
        !skill.is_active && 'opacity-75',
        className,
      )}
    >
      {selectionMode && (
        <span
          className={cn(
            'absolute top-1.5 right-1.5 z-10 flex h-5 w-5 items-center justify-center rounded border text-[10px]',
            selected ? 'border-primary/80 bg-primary text-white' : 'border-white/25 bg-black/40 text-transparent',
          )}
        >
          ✓
        </span>
      )}
      <div className={cn('absolute inset-x-0 top-0 h-16 bg-gradient-to-b opacity-45 pointer-events-none', theme.headerGrad)} />

      <div className="relative shrink-0 px-2.5 pt-2 pb-1.5 border-b border-white/5">
        <div className="flex items-start justify-between gap-1 min-w-0">
          <div className="min-w-0 flex-1">
            <h3 className={cn('text-[13px] font-bold text-white leading-tight line-clamp-2', theme.titleHover)}>
              {skill.skill_name}
            </h3>
            <p className={cn('text-[9px] truncate mt-0.5 capitalize', theme.accentText)}>
              {skill.skill_category.replace(/_/g, ' ')}
            </p>
          </div>
          <ChevronRight className={cn('h-3.5 w-3.5 text-white/25 shrink-0 mt-1 transition-colors', !selectionMode && theme.chevronHover, selectionMode && 'opacity-0')} />
        </div>
      </div>

      <div className="relative flex flex-1 flex-col min-h-0 gap-2 p-2.5">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="min-w-0">
            <p className="text-[8px] uppercase tracking-wider text-white/45">Level</p>
            <p className={cn('text-sm font-bold truncate', theme.statValue)}>{levelLabel(skill.current_level)}</p>
          </div>
          <span
            className={cn(
              'text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border shrink-0',
              status === 'active' && 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200',
              status === 'inactive' && 'border-white/20 bg-white/5 text-white/45',
              status === 'dormant' && 'border-amber-500/35 bg-amber-500/10 text-amber-200',
              status === 'emerging' && 'border-sky-500/35 bg-sky-500/10 text-sky-200',
            )}
          >
            {statusLabel(status)}
          </span>
        </div>

        {progress != null && (
          <div className={cn('h-1 rounded-full overflow-hidden', theme.progressTrack)} aria-hidden>
            <div
              className={cn('h-full bg-gradient-to-r rounded-full', theme.progress)}
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {blurb ? (
          <p className="text-[10px] text-white/55 leading-snug line-clamp-2">{blurb}</p>
        ) : null}

        <div className="mt-auto flex flex-wrap gap-x-2 gap-y-0.5 text-[9px] text-white/45">
          <span>
            Last <span className="text-white/70">{lastUsed}</span>
          </span>
          <span className="text-white/25" aria-hidden>
            ·
          </span>
          <span className="text-white/70">{usageCountLabel(skill.practice_count)}</span>
        </div>
      </div>
    </button>
  );
};
