import { useState } from 'react';
import {
  FileText,
  Users,
  Brain,
  BookOpen,
  Calendar,
  MapPin,
  Link2,
  Clock,
  TreePine,
  Trash2,
  MoreHorizontal,
  Wand2,
  Zap,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '../../lib/cn';
import { MobileBottomSheet } from '../ui/MobileBottomSheet';

export type OrgModalTabKey =
  | 'info'
  | 'chat'
  | 'members'
  | 'stories'
  | 'events'
  | 'locations'
  | 'relationships'
  | 'timeline'
  | 'influence'
  | 'insights'
  | 'lore'
  | 'family'
  | 'danger';

type TabDef = { key: OrgModalTabKey; label: string; shortLabel: string; icon: LucideIcon };

const PRIMARY_MOBILE: TabDef[] = [
  { key: 'info', label: 'Overview', shortLabel: 'Overview', icon: FileText },
  { key: 'members', label: 'People', shortLabel: 'People', icon: Users },
  { key: 'chat', label: 'Knowledge Chat', shortLabel: 'Chat', icon: Brain },
  { key: 'timeline', label: 'Timeline', shortLabel: 'Timeline', icon: Clock },
];

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
          <div className="flex items-stretch justify-around px-1 pt-1">
            {mobilePrimary.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => onTabChange(tab.key)}
                  className={cn(
                    'flex flex-1 flex-col items-center gap-0.5 py-1.5 px-0.5 min-h-[44px] touch-manipulation',
                    active ? 'text-primary' : 'text-white/45'
                  )}
                >
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
                  'flex flex-1 flex-col items-center gap-0.5 py-1.5 px-0.5 min-h-[44px] touch-manipulation',
                  isMoreActive ? 'text-primary' : 'text-white/45'
                )}
              >
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
      <div className="hidden sm:block flex-shrink-0 border-b border-white/8 px-4 pt-2 pb-0">
        <div className="flex gap-1 overflow-x-auto scrollbar-none pb-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;
            const isDanger = tab.key === 'danger';
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => onTabChange(tab.key)}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors',
                  isDanger
                    ? active
                      ? 'bg-red-500/15 text-red-200 border border-red-500/30'
                      : 'text-red-300/60 hover:text-red-200 hover:bg-red-500/10'
                    : active
                      ? 'bg-primary/20 text-white border border-primary/35'
                      : 'text-white/50 hover:text-white/80 hover:bg-white/5'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
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
  { key: 'chat', label: 'Knowledge Chat', shortLabel: 'Chat', icon: Brain },
  { key: 'members', label: 'People', shortLabel: 'People', icon: Users },
  { key: 'stories', label: 'Stories', shortLabel: 'Stories', icon: BookOpen },
  { key: 'events', label: 'Events', shortLabel: 'Events', icon: Calendar },
  { key: 'locations', label: 'Places', shortLabel: 'Places', icon: MapPin },
  { key: 'relationships', label: 'Relationships', shortLabel: 'Links', icon: Link2 },
  { key: 'timeline', label: 'Timeline', shortLabel: 'Timeline', icon: Clock },
  { key: 'influence', label: 'Influence', shortLabel: 'Influence', icon: Zap },
  { key: 'insights', label: 'Insights', shortLabel: 'Insights', icon: Wand2 },
  { key: 'lore', label: 'Lore', shortLabel: 'Lore', icon: Sparkles },
];
