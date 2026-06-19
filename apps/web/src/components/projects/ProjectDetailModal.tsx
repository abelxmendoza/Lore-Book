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
        {/* Hero */}
        <div className={`relative shrink-0 px-4 sm:px-6 pt-4 sm:pt-5 pb-4 bg-gradient-to-br ${gradient} border-b border-white/10`}>
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 sm:top-4 sm:right-4 text-white/50 hover:text-white p-2 rounded-lg hover:bg-white/10 z-10"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="flex items-start gap-3 pr-10">
            <div className="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-2xl bg-black/40 border-2 border-white/20 shrink-0 shadow-lg">
              <Briefcase className="h-6 w-6 sm:h-7 sm:w-7 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h2 className="text-xl sm:text-2xl font-bold text-white leading-tight break-words">{local.name}</h2>
                <Badge variant="outline" className={statusCfg.badge}>
                  {statusCfg.label}
                </Badge>
              </div>
              <p className="text-sm text-white/55 capitalize">
                {local.type?.replace(/_/g, ' ') ?? 'Project'}
                {local.started_at ? ` · since ${new Date(local.started_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}` : ''}
              </p>
              <p className="text-sm text-white/75 mt-2 italic leading-snug">&ldquo;{profile.purpose}&rdquo;</p>
              <p className="text-xs text-primary/80 mt-1 font-medium">{profile.currentPhase}</p>
            </div>
          </div>

          <div className="mt-4">
            <ProjectHeroStats profile={profile} />
          </div>
        </div>

        {readOnly && (
          <div className="mx-4 sm:mx-6 mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            From your communities graph — save as a named project to unlock full editing and timeline tracking.
          </div>
        )}

        {/* Tabs */}
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as TabKey)}
          className="flex flex-col flex-1 min-h-0 px-4 sm:px-6 pt-3"
        >
          <TabsList className="w-full flex-shrink-0 h-auto p-1 bg-white/5 border border-white/10 rounded-xl overflow-x-auto justify-start flex-nowrap gap-0.5 mb-3">
            {TABS.map(({ key, label, short, icon: Icon }) => (
              <TabsTrigger
                key={key}
                value={key}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 text-xs sm:text-sm data-[state=active]:bg-primary/20 data-[state=active]:text-primary-100 rounded-lg shrink-0"
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="hidden sm:inline">{label}</span>
                <span className="sm:hidden">{short}</span>
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
