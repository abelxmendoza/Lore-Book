import { Shield, Sparkles } from 'lucide-react';
import { Badge } from '../ui/badge';
import type { Skill, SkillMetadata, SkillProgress } from '../../types/skill';
import { skillCategoryTheme } from '../../lib/skillCategoryTheme';
import { cn } from '../../lib/cn';
import {
  buildStorySummary,
  formatCategoryHierarchy,
  formatFirstSeen,
  formatLastUsed,
  formatSkillCertainty,
  formatSkillCertaintyDetail,
  formatSkillCertaintyTitle,
  levelLabel,
  readRelatedSkillNames,
  skillCertaintyFieldLabel,
  skillStatus,
  statusLabel,
  usageCountLabel,
} from '../../lib/skillStory';
import { SkillOverviewExtras, type SkillEntityNavigation } from './SkillDetailTabPanels';

type Props = {
  skill: Skill;
  skillDetails: SkillMetadata | null;
  levelProgress: number;
  xpInCurrentLevel: number;
  xpNeededForLevel: number;
  progressHistory: SkillProgress[];
  loadingProgress: boolean;
  profile: ReturnType<typeof import('../../lib/skillProfile').readSkillProfile>;
  nav?: SkillEntityNavigation;
};

export function SkillDetailModalOverview({
  skill,
  skillDetails,
  levelProgress,
  xpInCurrentLevel,
  xpNeededForLevel,
  profile,
  nav,
}: Props) {
  const theme = skillCategoryTheme(skill.skill_category);
  const storySummary = buildStorySummary(skill, profile, skillDetails);
  const related = readRelatedSkillNames(skill.metadata);
  const status = skillStatus(skill, profile);
  const categoryLine = formatCategoryHierarchy(
    skill.skill_category,
    profile?.category_domain,
    profile?.category_subdomain,
  );

  return (
    <div className="space-y-3 sm:space-y-4">
      <SkillOverviewExtras skill={skill} profile={profile} theme={theme} nav={nav} />

      <div className="grid grid-cols-2 gap-2 text-[11px]">
        {[
          { label: 'Category', value: categoryLine },
          { label: 'Level', value: levelLabel(skill.current_level) },
          {
            label: skillCertaintyFieldLabel(),
            value: formatSkillCertainty(skill.confidence_score),
            hint: formatSkillCertaintyDetail(skill.confidence_score),
          },
          { label: 'Status', value: statusLabel(status) },
          { label: 'First seen', value: formatFirstSeen(skill.first_mentioned_at) },
          { label: 'Last used', value: formatLastUsed(skill.last_practiced_at, profile) },
          { label: 'Usage', value: usageCountLabel(skill.practice_count) },
        ].map(({ label, value, hint }) => (
          <div key={label} className={cn('rounded-md border px-2 py-1.5 min-w-0', theme.statBg, theme.statBorder)} title={hint}>
            <p className="text-[9px] uppercase tracking-wider text-white/45 truncate">{label}</p>
            <p className={cn('font-semibold truncate', theme.statValue)}>{value}</p>
          </div>
        ))}
      </div>

      <div className={cn('rounded-lg border p-3', theme.levelPanel)}>
        <p className="text-[10px] uppercase tracking-wider text-white/45 mb-1.5 flex items-center gap-1">
          <Sparkles className={cn('h-3 w-3', theme.icon)} /> Story summary
        </p>
        <p className="text-sm text-white/85 leading-relaxed">{storySummary}</p>
      </div>

      <div className={cn('rounded-lg border p-3', theme.levelPanel)}>
        <div className="flex justify-between text-[11px] text-white/60 mb-1.5">
          <span>Level {skill.current_level} → {skill.current_level + 1}</span>
          <span className={cn('font-semibold', theme.accentText)}>{Math.round(levelProgress)}%</span>
        </div>
        <div className={cn('h-2 rounded-full overflow-hidden', theme.progressTrack)}>
          <div className={cn('h-full bg-gradient-to-r rounded-full', theme.progress)} style={{ width: `${levelProgress}%` }} />
        </div>
        <p className="text-[10px] text-white/45 mt-1.5">
          {Math.floor(xpInCurrentLevel).toLocaleString()} / {Math.floor(xpNeededForLevel).toLocaleString()} XP in this level
        </p>
      </div>

      {related.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-white/45 mb-1.5">Related skills</p>
          <div className="flex flex-wrap gap-1.5">
            {related.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => nav?.onOpenRelatedSkill(name)}
                className={cn('text-[10px] capitalize border rounded-full px-2 py-0.5 touch-manipulation hover:brightness-125 transition-colors', theme.badge)}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        <Badge className={cn('text-[10px] capitalize border', theme.badge)}>{skill.skill_category}</Badge>
        {profile?.trajectory && profile.trajectory !== 'unknown' && (
          <Badge variant="outline" className="text-[10px] border-emerald-500/35 bg-emerald-500/10 text-emerald-200 capitalize">
            {profile.trajectory}
          </Badge>
        )}
        {skill.auto_detected && (
          <Badge variant="outline" className="text-[10px] bg-purple-500/15 border-purple-500/40 text-purple-300">
            Auto-detected
          </Badge>
        )}
        <Badge variant="outline" className={cn('text-[10px] border', theme.chip)} title={formatSkillCertaintyTitle(skill.confidence_score)}>
          <Shield className="h-2.5 w-2.5 mr-1 inline" aria-hidden />
          {formatSkillCertaintyDetail(skill.confidence_score)}
        </Badge>
      </div>
    </div>
  );
}
