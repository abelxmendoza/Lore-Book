import { useState } from 'react';
import {
  FileText,
  Users,
  MessageSquare,
  BookOpen,
  MapPin,
  Link2,
  Clock,
  Search,
  TreePine,
  Trash2,
  MoreHorizontal,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '../../lib/cn';
import { MobileBottomSheet } from '../ui/MobileBottomSheet';

export type OrgModalTabKey =
  | 'info'
  | 'chat'
  | 'members'
  | 'stories'
  | 'timeline'
  /** @deprecated aliased to timeline */
  | 'activity'
  /** @deprecated aliased to timeline */
  | 'events'
  | 'locations'
  | 'relationships'
  | 'sources'
  | 'influence'
  | 'insights'
  | 'lore'
  | 'family'
  | 'danger';

type TabDef = { key: OrgModalTabKey; label: string; shortLabel: string; icon: LucideIcon };

/** Idle outline accent — keeps unselected tabs readable without competing with the active fill. */
const TAB_IDLE_OUTLINE: Partial<Record<OrgModalTabKey, string>> = {
  info: 'border-sky-400/45 text-sky-100/70 hover:bg-sky-500/10 hover:text-sky-50 hover:border-sky-400/70',
  chat: 'border-violet-400/45 text-violet-100/70 hover:bg-violet-500/10 hover:text-violet-50 hover:border-violet-400/70',
  members: 'border-emerald-400/45 text-emerald-100/70 hover:bg-emerald-500/10 hover:text-emerald-50 hover:border-emerald-400/70',
  timeline: 'border-amber-400/45 text-amber-100/70 hover:bg-amber-500/10 hover:text-amber-50 hover:border-amber-400/70',
  activity: 'border-amber-400/45 text-amber-100/70 hover:bg-amber-500/10 hover:text-amber-50 hover:border-amber-400/70',
  events: 'border-amber-400/45 text-amber-100/70 hover:bg-amber-500/10 hover:text-amber-50 hover:border-amber-400/70',
  stories: 'border-rose-400/45 text-rose-100/70 hover:bg-rose-500/10 hover:text-rose-50 hover:border-rose-400/70',
  locations: 'border-teal-400/45 text-teal-100/70 hover:bg-teal-500/10 hover:text-teal-50 hover:border-teal-400/70',
  relationships: 'border-cyan-400/45 text-cyan-100/70 hover:bg-cyan-500/10 hover:text-cyan-50 hover:border-cyan-400/70',
  sources: 'border-sky-400/55 text-sky-100/80 hover:bg-sky-500/15 hover:text-sky-50 hover:border-sky-300/80',
  influence: 'border-orange-400/45 text-orange-100/70 hover:bg-orange-500/10 hover:text-orange-50 hover:border-orange-400/70',
  insights: 'border-fuchsia-400/45 text-fuchsia-100/70 hover:bg-fuchsia-500/10 hover:text-fuchsia-50 hover:border-fuchsia-400/70',
  lore: 'border-purple-400/45 text-purple-100/70 hover:bg-purple-500/10 hover:text-purple-50 hover:border-purple-400/70',
  family: 'border-lime-400/45 text-lime-100/70 hover:bg-lime-500/10 hover:text-lime-50 hover:border-lime-400/70',
};

const DEFAULT_IDLE_OUTLINE =
  'border-white/25 text-white/55 hover:text-white/85 hover:bg-white/[0.06] hover:border-white/40';

const PRIMARY_MOBILE: TabDef[] = [
  { key: 'info', label: 'Overview', shortLabel: 'Overview', icon: FileText },
  { key: 'members', label: 'People', shortLabel: 'People', icon: Users },
  { key: 'locations', label: 'Places', shortLabel: 'Places', icon: MapPin },
  { key: 'timeline', label: 'Timeline', shortLabel: 'Timeline', icon: Clock },
];

/** Map legacy Events / Activity tab keys onto the unified Timeline tab. */
export function normalizeOrgModalTab(tab: OrgModalTabKey): OrgModalTabKey {
  if (tab === 'events' || tab === 'activity') return 'timeline';
  return tab;
}

type Props = {
  tabs: TabDef[];
  activeTab: OrgModalTabKey;
  onTabChange: (tab: OrgModalTabKey) => void;
  showFamilyTab?: boolean;
  /** Desktop tabs under header, or mobile bottom bar inside the modal */
  placement?: 'top' | 'bottom';
};

export function OrganizationModalNav({
  tabs,
  activeTab,
  onTabChange,
  showFamilyTab,
  placement = 'top',
}: Props) {
  const [moreOpen, setMoreOpen] = useState(false);

  const primaryKeys = new Set(PRIMARY_MOBILE.map((t) => t.key));
  const moreTabs = tabs.filter((t) => !primaryKeys.has(t.key) && t.key !== 'danger');
  const dangerTab = tabs.find((t) => t.key === 'danger');

  const mobilePrimary = PRIMARY_MOBILE.filter((t) => tabs.some((x) => x.key === t.key));
  const isMoreActive = moreTabs.some((t) => t.key === activeTab) || activeTab === 'danger';

  if (placement === 'bottom') {
    return (
      <>
        <nav
          className="sm:hidden flex-shrink-0 border-t border-white/10 bg-black/95 backdrop-blur-md z-10"
          style={{ paddingBottom: 'max(0.35rem, env(safe-area-inset-bottom))' }}
          aria-label="Organization sections"
        >
          <div className="flex items-stretch justify-around px-1 pt-1.5">
            {mobilePrimary.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => onTabChange(tab.key)}
                  className={cn(
                    'relative flex flex-1 flex-col items-center gap-0.5 py-1.5 px-0.5 min-h-[44px] touch-manipulation transition-colors',
                    active ? 'text-primary' : 'text-white/45'
                  )}
                >
                  {active && (
                    <span className="absolute top-0 h-0.5 w-6 rounded-full bg-gradient-to-r from-primary/60 via-primary to-primary/60" />
                  )}
                  <Icon className={cn('h-4 w-4', active && tab.key === 'chat' && 'text-violet-300')} />
                  <span className="text-[9px] font-medium leading-none">{tab.shortLabel}</span>
                </button>
              );
            })}
            {(moreTabs.length > 0 || dangerTab) && (
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                className={cn(
                  'relative flex flex-1 flex-col items-center gap-0.5 py-1.5 px-0.5 min-h-[44px] touch-manipulation transition-colors',
                  isMoreActive ? 'text-primary' : 'text-white/45'
                )}
              >
                {isMoreActive && (
                  <span className="absolute top-0 h-0.5 w-6 rounded-full bg-gradient-to-r from-primary/60 via-primary to-primary/60" />
                )}
                <MoreHorizontal className="h-4 w-4" />
                <span className="text-[9px] font-medium leading-none">More</span>
              </button>
            )}
          </div>
        </nav>

        <MobileBottomSheet open={moreOpen} onClose={() => setMoreOpen(false)} title="More sections">
          <ul className="space-y-1 pb-2">
            {moreTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <li key={tab.key}>
                  <button
                    type="button"
                    onClick={() => {
                      onTabChange(tab.key);
                      setMoreOpen(false);
                    }}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm touch-manipulation',
                      activeTab === tab.key ? 'bg-primary/15 text-white' : 'text-white/75 hover:bg-white/5'
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-white/50" />
                    {tab.label}
                  </button>
                </li>
              );
            })}
            {showFamilyTab && !moreTabs.some((t) => t.key === 'family') && (
              <li>
                <button
                  type="button"
                  onClick={() => {
                    onTabChange('family');
                    setMoreOpen(false);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-white/75 hover:bg-white/5 touch-manipulation"
                >
                  <TreePine className="h-4 w-4 shrink-0" />
                  Family tree
                </button>
              </li>
            )}
            {dangerTab && (
              <li className="pt-2 border-t border-white/8 mt-2">
                <button
                  type="button"
                  onClick={() => {
                    onTabChange('danger');
                    setMoreOpen(false);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-red-300/90 hover:bg-red-500/10 touch-manipulation"
                >
                  <Trash2 className="h-4 w-4 shrink-0" />
                  Delete group
                </button>
              </li>
            )}
          </ul>
        </MobileBottomSheet>
      </>
    );
  }

  return (
    <>
      <div className="hidden sm:block flex-shrink-0 border-b border-white/8 bg-black/20 px-4 pt-2.5 pb-0 backdrop-blur-sm">
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-2.5">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;
            const isDanger = tab.key === 'danger';
            const idleOutline = TAB_IDLE_OUTLINE[tab.key] ?? DEFAULT_IDLE_OUTLINE;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => onTabChange(tab.key)}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium transition-all duration-150 border',
                  isDanger
                    ? active
                      ? 'bg-red-500/20 text-red-100 border-red-500/40 shadow-[0_0_0_1px_rgba(239,68,68,0.15),0_4px_12px_-2px_rgba(239,68,68,0.35)]'
                      : 'text-red-300/70 border-red-500/40 hover:text-red-200 hover:bg-red-500/10 hover:border-red-400/60'
                    : active
                      ? 'bg-gradient-to-b from-primary/30 to-primary/15 text-white border-primary/40 shadow-[0_0_0_1px_rgba(139,92,246,0.15),0_4px_14px_-2px_rgba(139,92,246,0.45)]'
                      : idleOutline
                )}
              >
                <Icon className={cn('h-3.5 w-3.5', active && !isDanger && 'text-violet-200')} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

export const ORG_MODAL_BASE_TABS: TabDef[] = [
  { key: 'info', label: 'Overview', shortLabel: 'Overview', icon: FileText },
  { key: 'chat', label: 'Chat', shortLabel: 'Chat', icon: MessageSquare },
  { key: 'members', label: 'People', shortLabel: 'People', icon: Users },
  { key: 'timeline', label: 'Timeline', shortLabel: 'Timeline', icon: Clock },
  { key: 'stories', label: 'Stories', shortLabel: 'Stories', icon: BookOpen },
  { key: 'locations', label: 'Places', shortLabel: 'Places', icon: MapPin },
  { key: 'relationships', label: 'Relationships', shortLabel: 'Links', icon: Link2 },
  { key: 'sources', label: 'Sources', shortLabel: 'Sources', icon: Search },
];
