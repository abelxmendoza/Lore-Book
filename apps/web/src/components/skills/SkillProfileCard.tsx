// =====================================================
// SKILL PROFILE CARD — story-driven, compact tile (all viewports)
// =====================================================

import React from 'react';
import { ChevronRight } from 'lucide-react';
import type { Skill } from '../../types/skill';
import { readSkillProfile } from '../../lib/skillProfile';
import { skillCategoryTheme } from '../../lib/skillCategoryTheme';
import { cn } from '../../lib/cn';
import {
  capabilityEntityTypeLabel,
  readSkillOntologyMeta,
} from '../../lib/skillOntology';
import {
  formatCategoryHierarchy,
  formatFirstSeen,
  formatLastUsed,
  formatSkillCertainty,
  formatSkillCertaintyDetail,
  levelLabel,
  levelProgressSegments,
  skillCertaintyFieldLabel,
  skillStatus,
  statusLabel,
  usageCountLabel,
  usageFrequencyLabel,
} from '../../lib/skillStory';

export interface SkillProfileCardProps {
  skill: Skill;
  onClick?: () => void;
  showProgress?: boolean;
  className?: string;
}

export const SkillProfileCard: React.FC<SkillProfileCardProps> = ({
  skill,
  onClick,
  showProgress = true,
  className,
}) => {
  const profile = readSkillProfile(skill.metadata);
  const ontology = readSkillOntologyMeta(skill.metadata);
  const theme = skillCategoryTheme(skill.skill_category);
  const categoryLine = formatCategoryHierarchy(
    skill.skill_category,
    profile?.category_domain,
    profile?.category_subdomain,
  );
  const status = skillStatus(skill, profile);
  const segments = levelProgressSegments(skill.current_level);
  const filled = Math.min(segments, Math.round(segments * 0.75));
  const showEntityBadge =
    ontology.capabilityEntityType
    && ontology.capabilityEntityType !== 'SKILL'
    && Boolean(skill.metadata?.capability_entity_type);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative w-full min-h-[11rem] text-left rounded-xl border bg-gradient-to-br transition-all duration-200 overflow-hidden flex flex-col touch-manipulation active:scale-[0.98] hover:shadow-lg',
        theme.bodyGrad,
        theme.border,
        theme.hoverBorder,
        theme.hoverShadow,
        !skill.is_active && 'opacity-75',
        className,
      )}
    >
      <div className={cn('absolute inset-x-0 top-0 h-20 bg-gradient-to-b opacity-45 pointer-events-none', theme.headerGrad)} />

      <div className="relative shrink-0 px-2.5 pt-2 pb-1.5 border-b border-white/5">
        <div className="flex items-start justify-between gap-1 min-w-0">
          <div className="min-w-0 flex-1">
            <h3 className={cn('text-[13px] font-bold text-white leading-tight line-clamp-2', theme.titleHover)}>
              {skill.skill_name}
            </h3>
            <p className={cn('text-[9px] truncate mt-0.5', theme.accentText)}>{categoryLine}</p>
            {showEntityBadge && (
              <span className="inline-flex mt-1 text-[8px] uppercase tracking-wide px-1.5 py-0.5 rounded border border-amber-500/35 bg-amber-500/10 text-amber-100/90">
                {capabilityEntityTypeLabel(ontology.capabilityEntityType)}
              </span>
            )}
          </div>
          <ChevronRight className={cn('h-3.5 w-3.5 text-white/25 shrink-0 mt-1 transition-colors', theme.chevronHover)} />
        </div>
      </div>

      <div className="relative flex flex-1 flex-col min-h-0 gap-2 p-2">
        <div className="grid grid-cols-2 gap-1.5">
          <div className={cn('rounded-md border px-2 py-1.5', theme.statBg, theme.statBorder)}>
            <p className="text-[8px] uppercase tracking-wider text-white/45">Level</p>
            <p className={cn('text-xs font-bold', theme.statValue)}>{levelLabel(skill.current_level)}</p>
            {showProgress && (
              <div className="flex gap-px mt-1" aria-hidden>
                {Array.from({ length: Math.min(8, segments) }).map((_, i) => (
                  <div
                    key={i}
                    className={cn('h-1 flex-1 rounded-sm', i < filled ? cn('bg-gradient-to-r', theme.progress) : theme.progressTrack)}
                  />
                ))}
              </div>
            )}
          </div>
          <div className={cn('rounded-md border px-2 py-1.5', theme.statBg, theme.statBorder)}>
            <p className="text-[8px] uppercase tracking-wider text-white/45">{skillCertaintyFieldLabel()}</p>
            <p
              className={cn('text-xs font-bold leading-tight', theme.statValue)}
              title={formatSkillCertaintyDetail(skill.confidence_score)}
            >
              {formatSkillCertainty(skill.confidence_score)}
            </p>
            <p className="text-[9px] text-white/45 mt-0.5">{usageFrequencyLabel(profile?.usage_frequency)}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[8px]">
          <span className="text-white/45">
            First seen <span className="text-white/70">{formatFirstSeen(skill.first_mentioned_at)}</span>
          </span>
          <span className="text-white/45">
            Last used <span className="text-white/70">{formatLastUsed(skill.last_practiced_at, profile)}</span>
          </span>
          <span className="text-white/45 col-span-2">
            Usage <span className="text-white/70">{usageCountLabel(skill.practice_count)}</span>
          </span>
        </div>

        <div className="mt-auto flex items-center justify-end">
          <span
            className={cn(
              'text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border',
              status === 'active' && 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200',
              status === 'inactive' && 'border-white/20 bg-white/5 text-white/45',
              status === 'dormant' && 'border-amber-500/35 bg-amber-500/10 text-amber-200',
              status === 'emerging' && 'border-sky-500/35 bg-sky-500/10 text-sky-200',
            )}
          >
            {statusLabel(status)}
          </span>
        </div>
      </div>
    </button>
  );
};
