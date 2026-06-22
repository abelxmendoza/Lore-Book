import { useEffect, useMemo, useState } from 'react';
import {
  Briefcase,
  X,
  FileText,
  Clock,
  Users,
  Wrench,
  BookOpen,
  MessageSquare,
} from 'lucide-react';
import { Modal } from '../ui/modal';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { Badge } from '../ui/badge';
import { useShouldUseMockData } from '../../hooks/useShouldUseMockData';
import { fetchProjectById, isEphemeralEntityId } from '../../lib/hydrateBookEntity';
import {
  enrichProjectForDemo,
  getProjectDetailProfile,
} from '../../mocks/projectModalDemoData';
import type { ProjectCardData } from './ProjectProfileCard';
import {
  ProjectOverviewTab,
  ProjectTimelineTab,
  ProjectPeopleTab,
  ProjectSkillsTab,
  ProjectStoryTab,
  ProjectChatTab,
  ProjectHeroStats,
  STATUS_CONFIG,
  TYPE_GRADIENT,
} from './ProjectDetailPanels';

const STATUSES = ['active', 'paused', 'completed', 'abandoned'] as const;

type TabKey = 'overview' | 'timeline' | 'people' | 'skills' | 'story' | 'chat';

const TABS: Array<{ key: TabKey; label: string; short: string; icon: typeof FileText }> = [
  { key: 'overview', label: 'Overview', short: 'Brief', icon: FileText },
  { key: 'timeline', label: 'Timeline', short: 'Arc', icon: Clock },
  { key: 'people', label: 'People', short: 'Team', icon: Users },
  { key: 'skills', label: 'Skills & files', short: 'Links', icon: Wrench },
  { key: 'story', label: 'Story', short: 'History', icon: BookOpen },
  { key: 'chat', label: 'Chat', short: 'Ask', icon: MessageSquare },
];

type Props = {
  project: ProjectCardData;
  onClose: () => void;
  onPatch: (id: string, patch: Partial<ProjectCardData>) => Promise<void>;
  onAskInChat?: (prompt: string, project: ProjectCardData) => void;
};

export function ProjectDetailModal({ project, onClose, onPatch, onAskInChat }: Props) {
  const demo = useShouldUseMockData();
  const enriched = useMemo(
    () => (demo ? enrichProjectForDemo(project) : project),
    [project, demo]
  );
  const profile = useMemo(
    () => getProjectDetailProfile(enriched, demo),
    [enriched, demo]
  );

  const [local, setLocal] = useState(enriched);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  useEffect(() => {
    setLocal(demo ? enrichProjectForDemo(project) : project);
    setActiveTab('overview');
  }, [project.id, demo, project]);

  useEffect(() => {
    if (demo || isEphemeralEntityId(project.id)) return;
    let cancelled = false;
    (async () => {
      try {
        const full = await fetchProjectById(project.id);
        if (!cancelled) setLocal(full);
      } catch {
        // Keep seed project from the Book on transient errors.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [project.id, demo]);

  const isFallback = local.metadata?.source === 'organizations_fallback';
  const readOnly = isFallback;
  const status = (local.status ?? 'active') as keyof typeof STATUS_CONFIG;
  const statusCfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.active;
  const typeKey = (local.type ?? 'default').toLowerCase();
  const gradient = TYPE_GRADIENT[typeKey] ?? TYPE_GRADIENT.default;

  const save = async (patch: Partial<ProjectCardData>) => {
    if (readOnly) return;
    await onPatch(local.id, patch);
  };

  const handleAsk = (prompt: string) => {
    onAskInChat?.(prompt, local);
    onClose();
  };

  return (
    <Modal isOpen onClose={onClose} maxWidth="3xl">
      <div
        className="flex flex-col min-h-0 h-full sm:max-h-[90vh]"
        style={{ paddingBottom: 'max(0px, env(safe-area-inset-bottom))' }}
      >
        {/* Hero — compact on mobile */}
        <div className={`relative shrink-0 border-b border-white/10 bg-gradient-to-br ${gradient}`}>
          <button
            type="button"
            onClick={onClose}
            className="absolute top-2 right-2 sm:top-3 sm:right-3 text-white/45 hover:text-white p-1.5 rounded-lg hover:bg-white/10 z-10 touch-manipulation"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>

          {/* Mobile */}
          <div
            className="sm:hidden px-3 py-2 pr-11 min-w-0"
            style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top, 0px))' }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/40 border border-white/15 shrink-0">
                <Briefcase className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <h2 className="text-sm font-bold text-white truncate leading-tight">{local.name}</h2>
                  <Badge variant="outline" className={`text-[9px] px-1 py-0 shrink-0 ${statusCfg.badge}`}>
                    {statusCfg.label}
                  </Badge>
                </div>
                <p className="text-[10px] text-white/45 truncate mt-0.5 capitalize">
                  {local.type?.replace(/_/g, ' ') ?? 'Project'}
                  {profile.currentPhase ? ` · ${profile.currentPhase}` : ''}
                </p>
              </div>
            </div>
            <div className="mt-2">
              <ProjectHeroStats profile={profile} />
            </div>
          </div>

          {/* Desktop */}
          <div className="hidden sm:block px-5 py-3.5 pr-14">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-black/40 border border-white/15 shrink-0">
                <Briefcase className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-bold text-white leading-tight">{local.name}</h2>
                  <Badge variant="outline" className={statusCfg.badge}>
                    {statusCfg.label}
                  </Badge>
                </div>
                <p className="text-xs text-white/50 capitalize mt-1">
                  {local.type?.replace(/_/g, ' ') ?? 'Project'}
                  {local.started_at
                    ? ` · since ${new Date(local.started_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
                    : ''}
                  {profile.currentPhase ? ` · ${profile.currentPhase}` : ''}
                </p>
              </div>
            </div>
            <div className="mt-3">
              <ProjectHeroStats profile={profile} />
            </div>
          </div>
        </div>

        {readOnly && (
          <div className="mx-3 sm:mx-5 mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[10px] sm:text-xs text-amber-200">
            From your communities graph — save as a named project to unlock full editing and timeline tracking.
          </div>
        )}

        {/* Tabs — stacked grid on mobile */}
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as TabKey)}
          className="flex flex-col flex-1 min-h-0 px-3 sm:px-5 pt-2 sm:pt-3"
        >
          <TabsList className="w-full flex-shrink-0 h-auto p-1 bg-white/5 border border-white/10 rounded-lg grid grid-cols-3 sm:flex sm:flex-wrap gap-1 mb-2 sm:mb-3 overflow-visible">
            {TABS.map(({ key, label, short, icon: Icon }) => (
              <TabsTrigger
                key={key}
                value={key}
                className="flex flex-col sm:flex-row items-center justify-center gap-0 sm:gap-1.5 px-1 py-1.5 sm:px-3 sm:py-2 text-[9px] sm:text-xs data-[state=active]:bg-primary/20 data-[state=active]:text-primary-100 rounded-md min-h-[2.25rem] sm:min-h-0 w-full sm:w-auto"
              >
                <Icon className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" />
                <span className="hidden sm:inline">{label}</span>
                <span className="sm:hidden leading-none mt-0.5">{short}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="flex-1 min-h-0 overflow-y-auto pb-4 sm:pb-6 -mx-1 px-1">
            <TabsContent value="overview" className="mt-0 focus-visible:outline-none">
              <ProjectOverviewTab
                project={local}
                profile={profile}
                readOnly={readOnly}
                localDescription={local.description ?? ''}
                localSummary={(local as { summary?: string }).summary ?? profile.purpose}
                onDescriptionChange={(v) => setLocal((p) => ({ ...p, description: v }))}
                onSummaryChange={(v) => setLocal((p) => ({ ...p, summary: v }))}
                onDescriptionBlur={() => void save({ description: local.description ?? '' })}
                onSummaryBlur={() =>
                  void save({ summary: (local as { summary?: string }).summary ?? '' } as Partial<ProjectCardData>)
                }
                onStatusChange={(statusValue) => {
                  if (!STATUSES.includes(statusValue as (typeof STATUSES)[number])) return;
                  setLocal((p) => ({ ...p, status: statusValue }));
                  void save({ status: statusValue });
                }}
              />
            </TabsContent>

            <TabsContent value="timeline" className="mt-0 focus-visible:outline-none">
              <ProjectTimelineTab profile={profile} />
            </TabsContent>

            <TabsContent value="people" className="mt-0 focus-visible:outline-none">
              <ProjectPeopleTab profile={profile} />
            </TabsContent>

            <TabsContent value="skills" className="mt-0 focus-visible:outline-none">
              <ProjectSkillsTab profile={profile} />
            </TabsContent>

            <TabsContent value="story" className="mt-0 focus-visible:outline-none">
              <ProjectStoryTab profile={profile} />
            </TabsContent>

            <TabsContent value="chat" className="mt-0 focus-visible:outline-none">
              <ProjectChatTab project={local} profile={profile} onAsk={handleAsk} />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </Modal>
  );
}
