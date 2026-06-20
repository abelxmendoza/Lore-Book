export type SkillCategoryTheme = {
  headerGrad: string;
  bodyGrad: string;
  border: string;
  hoverBorder: string;
  hoverShadow: string;
  chip: string;
  icon: string;
  statBg: string;
  statBorder: string;
  statValue: string;
  progress: string;
  progressTrack: string;
  titleHover: string;
  chevronHover: string;
  accentText: string;
  levelPanel: string;
  badge: string;
};

const DEFAULT: SkillCategoryTheme = {
  headerGrad: 'from-teal-500/45 via-cyan-900/50 to-teal-950/40',
  bodyGrad: 'from-teal-950/25 via-black/55 to-cyan-950/20',
  border: 'border-teal-500/25',
  hoverBorder: 'hover:border-teal-400/55',
  hoverShadow: 'hover:shadow-teal-500/20',
  chip: 'text-teal-100 bg-teal-500/20 border-teal-400/35',
  icon: 'text-teal-200',
  statBg: 'bg-teal-500/10',
  statBorder: 'border-teal-500/20',
  statValue: 'text-teal-200',
  progress: 'from-teal-400 to-cyan-300',
  progressTrack: 'bg-teal-950/60',
  titleHover: 'group-hover:text-teal-100',
  chevronHover: 'group-hover:text-teal-300',
  accentText: 'text-teal-300/90',
  levelPanel: 'border-teal-500/30 bg-gradient-to-br from-teal-500/10 to-cyan-500/5',
  badge: 'bg-teal-500/20 text-teal-200 border-teal-500/40',
};

const BY_CATEGORY: Record<string, SkillCategoryTheme> = {
  professional: {
    headerGrad: 'from-blue-500/50 via-indigo-950/55 to-blue-950/45',
    bodyGrad: 'from-blue-950/30 via-black/50 to-indigo-950/25',
    border: 'border-blue-500/30',
    hoverBorder: 'hover:border-blue-400/55',
    hoverShadow: 'hover:shadow-blue-500/25',
    chip: 'text-blue-100 bg-blue-500/25 border-blue-400/40',
    icon: 'text-blue-200',
    statBg: 'bg-blue-500/12',
    statBorder: 'border-blue-500/25',
    statValue: 'text-blue-200',
    progress: 'from-blue-400 to-indigo-300',
    progressTrack: 'bg-blue-950/60',
    titleHover: 'group-hover:text-blue-100',
    chevronHover: 'group-hover:text-blue-300',
    accentText: 'text-blue-300/90',
    levelPanel: 'border-blue-500/35 bg-gradient-to-br from-blue-500/12 to-indigo-500/6',
    badge: 'bg-blue-500/20 text-blue-200 border-blue-500/40',
  },
  creative: {
    headerGrad: 'from-purple-500/50 via-fuchsia-950/55 to-violet-950/45',
    bodyGrad: 'from-purple-950/30 via-black/50 to-fuchsia-950/25',
    border: 'border-purple-500/30',
    hoverBorder: 'hover:border-purple-400/55',
    hoverShadow: 'hover:shadow-purple-500/25',
    chip: 'text-purple-100 bg-purple-500/25 border-purple-400/40',
    icon: 'text-purple-200',
    statBg: 'bg-purple-500/12',
    statBorder: 'border-purple-500/25',
    statValue: 'text-purple-200',
    progress: 'from-purple-400 to-fuchsia-300',
    progressTrack: 'bg-purple-950/60',
    titleHover: 'group-hover:text-purple-100',
    chevronHover: 'group-hover:text-purple-300',
    accentText: 'text-purple-300/90',
    levelPanel: 'border-purple-500/35 bg-gradient-to-br from-purple-500/12 to-fuchsia-500/6',
    badge: 'bg-purple-500/20 text-purple-200 border-purple-500/40',
  },
  artistic: {
    headerGrad: 'from-fuchsia-500/50 via-pink-950/55 to-purple-950/45',
    bodyGrad: 'from-fuchsia-950/30 via-black/50 to-pink-950/25',
    border: 'border-fuchsia-500/30',
    hoverBorder: 'hover:border-fuchsia-400/55',
    hoverShadow: 'hover:shadow-fuchsia-500/25',
    chip: 'text-fuchsia-100 bg-fuchsia-500/25 border-fuchsia-400/40',
    icon: 'text-fuchsia-200',
    statBg: 'bg-fuchsia-500/12',
    statBorder: 'border-fuchsia-500/25',
    statValue: 'text-fuchsia-200',
    progress: 'from-fuchsia-400 to-pink-300',
    progressTrack: 'bg-fuchsia-950/60',
    titleHover: 'group-hover:text-fuchsia-100',
    chevronHover: 'group-hover:text-fuchsia-300',
    accentText: 'text-fuchsia-300/90',
    levelPanel: 'border-fuchsia-500/35 bg-gradient-to-br from-fuchsia-500/12 to-pink-500/6',
    badge: 'bg-fuchsia-500/20 text-fuchsia-200 border-fuchsia-500/40',
  },
  physical: {
    headerGrad: 'from-emerald-500/50 via-green-950/55 to-teal-950/45',
    bodyGrad: 'from-emerald-950/30 via-black/50 to-green-950/25',
    border: 'border-emerald-500/30',
    hoverBorder: 'hover:border-emerald-400/55',
    hoverShadow: 'hover:shadow-emerald-500/25',
    chip: 'text-emerald-100 bg-emerald-500/25 border-emerald-400/40',
    icon: 'text-emerald-200',
    statBg: 'bg-emerald-500/12',
    statBorder: 'border-emerald-500/25',
    statValue: 'text-emerald-200',
    progress: 'from-emerald-400 to-lime-300',
    progressTrack: 'bg-emerald-950/60',
    titleHover: 'group-hover:text-emerald-100',
    chevronHover: 'group-hover:text-emerald-300',
    accentText: 'text-emerald-300/90',
    levelPanel: 'border-emerald-500/35 bg-gradient-to-br from-emerald-500/12 to-lime-500/6',
    badge: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40',
  },
  social: {
    headerGrad: 'from-rose-500/50 via-pink-950/55 to-rose-950/45',
    bodyGrad: 'from-rose-950/30 via-black/50 to-pink-950/25',
    border: 'border-rose-500/30',
    hoverBorder: 'hover:border-rose-400/55',
    hoverShadow: 'hover:shadow-rose-500/25',
    chip: 'text-rose-100 bg-rose-500/25 border-rose-400/40',
    icon: 'text-rose-200',
    statBg: 'bg-rose-500/12',
    statBorder: 'border-rose-500/25',
    statValue: 'text-rose-200',
    progress: 'from-rose-400 to-orange-300',
    progressTrack: 'bg-rose-950/60',
    titleHover: 'group-hover:text-rose-100',
    chevronHover: 'group-hover:text-rose-300',
    accentText: 'text-rose-300/90',
    levelPanel: 'border-rose-500/35 bg-gradient-to-br from-rose-500/12 to-pink-500/6',
    badge: 'bg-rose-500/20 text-rose-200 border-rose-500/40',
  },
  emotional: {
    headerGrad: 'from-pink-500/50 via-rose-950/55 to-red-950/45',
    bodyGrad: 'from-pink-950/30 via-black/50 to-rose-950/25',
    border: 'border-pink-500/30',
    hoverBorder: 'hover:border-pink-400/55',
    hoverShadow: 'hover:shadow-pink-500/25',
    chip: 'text-pink-100 bg-pink-500/25 border-pink-400/40',
    icon: 'text-pink-200',
    statBg: 'bg-pink-500/12',
    statBorder: 'border-pink-500/25',
    statValue: 'text-pink-200',
    progress: 'from-pink-400 to-rose-300',
    progressTrack: 'bg-pink-950/60',
    titleHover: 'group-hover:text-pink-100',
    chevronHover: 'group-hover:text-pink-300',
    accentText: 'text-pink-300/90',
    levelPanel: 'border-pink-500/35 bg-gradient-to-br from-pink-500/12 to-rose-500/6',
    badge: 'bg-pink-500/20 text-pink-200 border-pink-500/40',
  },
  technical: {
    headerGrad: 'from-cyan-500/50 via-sky-950/55 to-blue-950/45',
    bodyGrad: 'from-cyan-950/30 via-black/50 to-sky-950/25',
    border: 'border-cyan-500/30',
    hoverBorder: 'hover:border-cyan-400/55',
    hoverShadow: 'hover:shadow-cyan-500/25',
    chip: 'text-cyan-100 bg-cyan-500/25 border-cyan-400/40',
    icon: 'text-cyan-200',
    statBg: 'bg-cyan-500/12',
    statBorder: 'border-cyan-500/25',
    statValue: 'text-cyan-200',
    progress: 'from-cyan-400 to-sky-300',
    progressTrack: 'bg-cyan-950/60',
    titleHover: 'group-hover:text-cyan-100',
    chevronHover: 'group-hover:text-cyan-300',
    accentText: 'text-cyan-300/90',
    levelPanel: 'border-cyan-500/35 bg-gradient-to-br from-cyan-500/12 to-sky-500/6',
    badge: 'bg-cyan-500/20 text-cyan-200 border-cyan-500/40',
  },
  intellectual: {
    headerGrad: 'from-indigo-500/50 via-violet-950/55 to-blue-950/45',
    bodyGrad: 'from-indigo-950/30 via-black/50 to-violet-950/25',
    border: 'border-indigo-500/30',
    hoverBorder: 'hover:border-indigo-400/55',
    hoverShadow: 'hover:shadow-indigo-500/25',
    chip: 'text-indigo-100 bg-indigo-500/25 border-indigo-400/40',
    icon: 'text-indigo-200',
    statBg: 'bg-indigo-500/12',
    statBorder: 'border-indigo-500/25',
    statValue: 'text-indigo-200',
    progress: 'from-indigo-400 to-violet-300',
    progressTrack: 'bg-indigo-950/60',
    titleHover: 'group-hover:text-indigo-100',
    chevronHover: 'group-hover:text-indigo-300',
    accentText: 'text-indigo-300/90',
    levelPanel: 'border-indigo-500/35 bg-gradient-to-br from-indigo-500/12 to-violet-500/6',
    badge: 'bg-indigo-500/20 text-indigo-200 border-indigo-500/40',
  },
  practical: {
    headerGrad: 'from-amber-500/50 via-orange-950/55 to-yellow-950/45',
    bodyGrad: 'from-amber-950/30 via-black/50 to-orange-950/25',
    border: 'border-amber-500/30',
    hoverBorder: 'hover:border-amber-400/55',
    hoverShadow: 'hover:shadow-amber-500/25',
    chip: 'text-amber-100 bg-amber-500/25 border-amber-400/40',
    icon: 'text-amber-200',
    statBg: 'bg-amber-500/12',
    statBorder: 'border-amber-500/25',
    statValue: 'text-amber-200',
    progress: 'from-amber-400 to-yellow-300',
    progressTrack: 'bg-amber-950/60',
    titleHover: 'group-hover:text-amber-100',
    chevronHover: 'group-hover:text-amber-300',
    accentText: 'text-amber-300/90',
    levelPanel: 'border-amber-500/35 bg-gradient-to-br from-amber-500/12 to-orange-500/6',
    badge: 'bg-amber-500/20 text-amber-200 border-amber-500/40',
  },
};

export function skillCategoryTheme(category: string): SkillCategoryTheme {
  return BY_CATEGORY[category] ?? DEFAULT;
}

/** Active filter chip styling for category tabs on Skills book. */
export function skillFilterChipActive(category: string): string {
  if (category === 'all') {
    return 'bg-violet-500/15 border-violet-500/45 text-violet-200 shadow-[inset_0_0_12px_rgba(255,255,255,0.04)]';
  }
  const t = skillCategoryTheme(category);
  return `${t.statBg} ${t.border} ${t.accentText} font-semibold shadow-[inset_0_0_12px_rgba(255,255,255,0.04)]`;
}
