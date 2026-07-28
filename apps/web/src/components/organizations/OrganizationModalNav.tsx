import {
  FileText,
  Users,
  MessageSquare,
  BookOpen,
  MapPin,
  Link2,
  Clock,
  Search,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '../../lib/cn';

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

/** Map legacy Events / Activity tab keys onto the unified Timeline tab. */
export function normalizeOrgModalTab(tab: OrgModalTabKey): OrgModalTabKey {
  if (tab === 'events' || tab === 'activity') return 'timeline';
  return tab;
}

type Props = {
  tabs: TabDef[];
  activeTab: OrgModalTabKey;
  onTabChange: (tab: OrgModalTabKey) => void;
  /** @deprecated Family is included when present in `tabs`; kept for call-site compat. */
  showFamilyTab?: boolean;
  /** Desktop tabs under header, or mobile bottom bar inside the modal */
  placement?: 'top' | 'bottom';
};

export function OrganizationModalNav({
  tabs,
  activeTab,
  onTabChange,
  placement = 'top',
}: Props) {
  const sectionTabs = tabs.filter((t) => t.key !== 'danger');
  const dangerTab = tabs.find((t) => t.key === 'danger');

  if (placement === 'bottom') {
    return (
      <nav
        className="sm:hidden flex-shrink-0 border-t border-white/10 bg-black/95 backdrop-blur-md z-10"
        style={{ paddingBottom: 'max(0.2rem, env(safe-area-inset-bottom))' }}
        aria-label="Organization sections"
      >
        {/* Two-row wrap: every section visible — no More overflow. */}
        <div className="grid grid-cols-4 gap-y-0 px-1 pt-1">
          {sectionTabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => onTabChange(tab.key)}
                className={cn(
                  'relative flex flex-col items-center gap-px py-1 px-0.5 min-h-[36px] touch-manipulation transition-colors',
                  active ? 'text-primary' : 'text-white/45'
                )}
              >
                {active && (
                  <span className="absolute top-0 h-0.5 w-5 rounded-full bg-gradient-to-r from-primary/60 via-primary to-primary/60" />
                )}
                <Icon className={cn('h-3.5 w-3.5', active && tab.key === 'chat' && 'text-violet-300')} />
                <span className="text-[8px] font-medium leading-none">{tab.shortLabel}</span>
              </button>
            );
          })}
        </div>
        {dangerTab && (
          <div className="flex justify-center border-t border-white/6 px-2 pb-0.5 pt-0">
            <button
              type="button"
              onClick={() => onTabChange('danger')}
              className={cn(
                'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-medium touch-manipulation transition-colors',
                activeTab === 'danger'
                  ? 'text-red-200 bg-red-500/15'
                  : 'text-red-300/70 hover:text-red-200 hover:bg-red-500/10'
              )}
            >
              <Trash2 className="h-2.5 w-2.5" />
              Delete group
            </button>
          </div>
        )}
      </nav>
    );
  }

  return (
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
