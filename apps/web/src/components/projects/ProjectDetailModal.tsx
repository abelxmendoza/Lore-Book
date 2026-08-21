import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Briefcase,
  X,
  FileText,
  Clock,
  Users,
  Wrench,
  BookOpen,
  MessageSquare,
  Trash2,
} from 'lucide-react';
import { Modal } from '../ui/modal';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { EntityModalBottomNav } from '../common/EntityModalBottomNav';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { Input } from '../ui/input';
import { useShouldUseMockData } from '../../hooks/useShouldUseMockData';
import { fetchProjectById, isEphemeralEntityId } from '../../lib/hydrateBookEntity';
import {
  enrichProjectForDemo,
  getProjectDetailProfile,
} from '../../mocks/projectModalDemoData';
import { projectHasEnoughTimelineForLorebook } from '../../lib/projectTimelineClipboard';
import { hasJournalOccurrence } from '../../lib/journalOccurrence';
import {
  evaluateProjectTierOffer,
  type LorebookForm,
} from '../../lib/lorebookTiers';
import {
  KnowledgeBaseCreator,
  type LorebookCreatorPrefill,
} from '../lorebook/KnowledgeBaseCreator';
import { EntityLorebookCompileControl } from '../lorebook/EntityLorebookCompileControl';
import type { ProjectCardData } from './ProjectProfileCard';
import { projectAliasesForDisplay } from './ProjectProfileCard';
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

type TabKey = 'overview' | 'timeline' | 'people' | 'skills' | 'story' | 'chat' | 'danger';

const SECTION_TABS: Array<{ key: Exclude<TabKey, 'danger'>; label: string; short: string; icon: typeof FileText }> = [
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
  onDelete?: (id: string) => void | Promise<void>;
  onAskInChat?: (prompt: string, project: ProjectCardData) => void;
};

export function ProjectDetailModal({ project, onClose, onPatch, onDelete, onAskInChat }: Props) {
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);
  const [deleteStep, setDeleteStep] = useState<null | 'warn' | 'type'>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [lorebookPrefill, setLorebookPrefill] = useState<LorebookCreatorPrefill | null>(null);
  const demo = useShouldUseMockData();
  const enriched = useMemo(
    () => (demo ? enrichProjectForDemo(project) : project),
    [project, demo]
  );

  const [local, setLocal] = useState(enriched);
  const [nameDraft, setNameDraft] = useState(enriched.name);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const profile = useMemo(
    () => getProjectDetailProfile(local, demo),
    [local, demo]
  );
  const aliases = useMemo(() => projectAliasesForDisplay(local.metadata), [local.metadata]);
  const projectTierOffer = useMemo(
    () => evaluateProjectTierOffer(profile, local.name),
    [profile, local.name],
  );
  const canMakeLorebook =
    projectTierOffer.canCreateAny || projectHasEnoughTimelineForLorebook(profile);

  const openInOmniTimeline = (query: string) => {
    onClose();
    navigate(`/timeline?view=search&q=${encodeURIComponent(query)}`);
  };

  const openProjectLorebookCreator = (form?: LorebookForm) => {
    const tierOffer = evaluateProjectTierOffer(profile, local.name);
    if (!tierOffer.canCreateAny && !projectHasEnoughTimelineForLorebook(profile)) return;
    const selected = form ?? tierOffer.highestUnlocked ?? 'vignette';
    const times = profile.milestones
      .map((m) => (hasJournalOccurrence(m.date) ? Date.parse(m.date) : NaN))
      .filter((t) => Number.isFinite(t));
    const themes = [local.name, local.type, ...(local.tags ?? []), ...aliases]
      .filter(Boolean)
      .join(', ');
    const base = {
      lorebookName: `${local.name} LoreBook`,
      saveAsCore: true as const,
      form: selected,
      unlockedForms: tierOffer.unlocked,
    };
    if (times.length >= 2) {
      setLorebookPrefill({
        ...base,
        scope: 'time_range',
        timeRangeStart: new Date(Math.min(...times)).toISOString().slice(0, 10),
        timeRangeEnd: new Date(Math.max(...times)).toISOString().slice(0, 10),
        themes,
      });
    } else {
      setLorebookPrefill({
        ...base,
        scope: 'thematic',
        themes: themes || local.name,
      });
    }
  };

  useEffect(() => {
    const next = demo ? enrichProjectForDemo(project) : project;
    setLocal(next);
    setNameDraft(next.name);
    setActiveTab('overview');
    setDeleteStep(null);
    setDeleteConfirmText('');
    setDeleteError(null);
  }, [project.id, demo, project]);

  useEffect(() => {
    if (demo || isEphemeralEntityId(project.id)) return;
    let cancelled = false;
    (async () => {
      try {
        const full = await fetchProjectById(project.id);
        if (!cancelled) {
          setLocal(full);
          setNameDraft(full.name);
        }
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
  const canDelete = Boolean(onDelete) && !readOnly;
  const status = (local.status ?? 'active') as keyof typeof STATUS_CONFIG;
  const statusCfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.active;
  const typeKey = (local.type ?? 'default').toLowerCase();
  const gradient = TYPE_GRADIENT[typeKey] ?? TYPE_GRADIENT.default;
  const effectiveDeleteStep = activeTab === 'danger' ? deleteStep ?? 'warn' : deleteStep;

  const navTabs = useMemo(() => {
    const list: Array<{ key: TabKey; label: string; short: string; icon: typeof FileText }> = [
      ...SECTION_TABS,
    ];
    if (canDelete) {
      list.push({ key: 'danger', label: 'Delete', short: 'Delete', icon: Trash2 });
    }
    return list;
  }, [canDelete]);

  const save = async (patch: Partial<ProjectCardData> & { aliases?: string[] }) => {
    if (readOnly) return;
    const { aliases: nextAliases, ...rest } = patch;
    if (nextAliases) {
      await onPatch(local.id, {
        ...rest,
        metadata: {
          ...(local.metadata ?? {}),
          aliases: nextAliases,
          aliases_source: 'user_confirmed',
        },
      });
      setLocal((prev) => ({
        ...prev,
        ...rest,
        metadata: {
          ...(prev.metadata ?? {}),
          aliases: nextAliases,
          aliases_source: 'user_confirmed',
        },
      }));
      return;
    }
    await onPatch(local.id, rest);
    setLocal((prev) => ({ ...prev, ...rest }));
  };

  const saveName = async () => {
    const next = nameDraft.trim();
    if (!next || next === local.name || readOnly) {
      setNameDraft(local.name);
      return;
    }
    setLocal((prev) => ({ ...prev, name: next }));
    await save({ name: next });
  };

  const saveAliases = async (next: string[]) => {
    const cleaned = [...new Set(next.map((a) => a.trim()).filter(Boolean))];
    await save({ aliases: cleaned });
  };

  const handleAsk = (prompt: string) => {
    onAskInChat?.(prompt, local);
    onClose();
  };

  const resetDeleteFlow = () => {
    setDeleteStep(null);
    setDeleteConfirmText('');
    setDeleteError(null);
  };

  const setTab = (tab: TabKey) => {
    setActiveTab(tab);
    if (tab === 'danger') {
      setDeleteStep('warn');
      setDeleteConfirmText('');
      setDeleteError(null);
    } else {
      resetDeleteFlow();
    }
  };

  const handleDelete = async () => {
    if (deleting || readOnly || !onDelete) return;
    if (effectiveDeleteStep !== 'type') {
      setDeleteStep('type');
      return;
    }
    if (deleteConfirmText.trim() !== local.name) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await onDelete(local.id);
      onClose();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete project.');
      setDeleting(false);
    }
  };

  return (
    <>
    <Modal isOpen onClose={onClose} maxWidth="3xl">
      <div
        className="flex flex-col min-h-0 h-full sm:max-h-[90vh]"
        style={{ paddingBottom: 'max(0px, env(safe-area-inset-bottom))' }}
      >
        {/* Hero — compact on mobile */}
        <div className={`relative shrink-0 border-b border-white/10 bg-gradient-to-br ${gradient}`}>
          <div className="absolute top-2 right-2 sm:top-3 sm:right-3 z-10 flex items-center gap-1.5">
            <EntityLorebookCompileControl
              subjectLabel={local.name}
              tierOffer={projectTierOffer}
              forceEnable={canMakeLorebook && !projectTierOffer.canCreateAny}
              autoFetchSignals={false}
              testId="project-modal-lorebook-compile"
              className="hidden sm:inline-flex"
            />
            <button
              type="button"
              onClick={onClose}
              className="text-white/45 hover:text-white p-1.5 rounded-lg hover:bg-white/10 touch-manipulation"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

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
                {aliases.length > 0 && (
                  <p className="text-[10px] text-white/35 truncate mt-0.5">
                    Also {aliases.slice(0, 2).join(' · ')}
                    {aliases.length > 2 ? ` +${aliases.length - 2}` : ''}
                  </p>
                )}
                <div className="mt-1.5 sm:hidden">
                  <EntityLorebookCompileControl
                    subjectLabel={local.name}
                    tierOffer={projectTierOffer}
                    forceEnable={canMakeLorebook && !projectTierOffer.canCreateAny}
                    autoFetchSignals={false}
                    testId="project-modal-lorebook-compile-mobile"
                  />
                </div>
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
                {aliases.length > 0 && (
                  <p className="text-xs text-white/40 mt-1 truncate">
                    Also known as {aliases.join(' · ')}
                  </p>
                )}
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

        {/* Tabs — desktop nav; mobile uses the bottom nav */}
        <Tabs
          value={activeTab}
          onValueChange={(v) => setTab(v as TabKey)}
          className="flex flex-col flex-1 min-h-0 px-3 sm:px-5 pt-2 sm:pt-3"
        >
          <TabsList className="hidden sm:flex w-full flex-shrink-0 h-auto p-1 bg-white/5 border border-white/10 rounded-lg flex-wrap gap-1 mb-2 sm:mb-3 overflow-visible">
            {navTabs.map(({ key, label, short, icon: Icon }) => (
              <TabsTrigger
                key={key}
                value={key}
                className={
                  key === 'danger'
                    ? 'flex flex-col sm:flex-row items-center justify-center gap-0 sm:gap-1.5 px-1 py-1.5 sm:px-3 sm:py-2 text-[9px] sm:text-xs data-[state=active]:bg-red-500/20 data-[state=active]:text-red-100 text-red-300/80 rounded-md min-h-[2.25rem] sm:min-h-0 w-full sm:w-auto'
                    : 'flex flex-col sm:flex-row items-center justify-center gap-0 sm:gap-1.5 px-1 py-1.5 sm:px-3 sm:py-2 text-[9px] sm:text-xs data-[state=active]:bg-primary/20 data-[state=active]:text-primary-100 rounded-md min-h-[2.25rem] sm:min-h-0 w-full sm:w-auto'
                }
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
                nameDraft={nameDraft}
                aliases={aliases}
                onNameChange={setNameDraft}
                onNameBlur={() => void saveName()}
                onAliasesChange={(next) => void saveAliases(next)}
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
              <ProjectTimelineTab
                project={local}
                profile={profile}
                onOpenInOmniTimeline={openInOmniTimeline}
                onCreateLorebook={openProjectLorebookCreator}
              />
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

            {canDelete && (
              <TabsContent value="danger" className="mt-0 focus-visible:outline-none">
                <Card className="border-red-500/25 bg-gradient-to-br from-red-500/10 via-black/40 to-black/50 overflow-hidden">
                  <CardContent className="p-5 space-y-4">
                    <div className="flex items-start gap-3">
                      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-red-500/25 bg-red-500/10">
                        <AlertTriangle className="h-5 w-5 text-red-400" />
                      </span>
                      <div className="min-w-0">
                        {effectiveDeleteStep === 'warn' && (
                          <>
                            <h3 className="text-lg font-semibold text-white">Delete {local.name}?</h3>
                            <p className="text-sm text-white/60 mt-1">
                              Deleting removes this project from your Projects book. Linked moments and chat context may be harder to find. This cannot be undone.
                            </p>
                            <p className="text-xs text-white/45 mt-2">
                              Step 1 of 2 — continue to type the project name.
                            </p>
                          </>
                        )}
                        {effectiveDeleteStep === 'type' && (
                          <>
                            <h3 className="text-lg font-semibold text-white">Type the name to confirm</h3>
                            <p className="text-sm text-white/60 mt-1">
                              Enter <span className="font-mono text-red-200">{local.name}</span> to delete this project.
                            </p>
                            <p className="text-xs text-white/45 mt-2">Step 2 of 2 — name must match exactly.</p>
                            <Input
                              className="mt-3 bg-black/40 border-red-500/20"
                              value={deleteConfirmText}
                              onChange={(e) => setDeleteConfirmText(e.target.value)}
                              placeholder={local.name}
                              autoFocus
                              data-testid="project-delete-confirm-input"
                            />
                          </>
                        )}
                      </div>
                    </div>

                    {deleteError && (
                      <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                        {deleteError}
                      </div>
                    )}

                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" onClick={() => setTab('overview')} disabled={deleting}>
                        Cancel
                      </Button>
                      {effectiveDeleteStep === 'warn' && (
                        <Button
                          onClick={() => setDeleteStep('type')}
                          className="bg-red-500/15 hover:bg-red-500/25 text-red-100 border border-red-500/30"
                          data-testid="project-delete-continue"
                        >
                          Continue
                        </Button>
                      )}
                      {effectiveDeleteStep === 'type' && (
                        <Button
                          onClick={() => void handleDelete()}
                          disabled={deleting || deleteConfirmText.trim() !== local.name}
                          className="bg-red-500/20 hover:bg-red-500/30 text-red-100 border border-red-500/30 disabled:opacity-40"
                          leftIcon={<Trash2 className="h-4 w-4" />}
                          data-testid="project-delete-confirm"
                        >
                          {deleting ? 'Deleting…' : 'Delete project'}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            )}
          </div>
        </Tabs>

        <EntityModalBottomNav
          tabs={SECTION_TABS.map((t) => ({ key: t.key, label: t.label, shortLabel: t.short, icon: t.icon }))}
          activeTab={activeTab === 'danger' ? null : activeTab}
          onTabChange={setTab}
          ariaLabel="Project sections"
          dangerAction={
            canDelete
              ? {
                  label: 'Delete project',
                  icon: Trash2,
                  onClick: () => setTab('danger'),
                  active: activeTab === 'danger',
                }
              : undefined
          }
        />
      </div>
    </Modal>

      {lorebookPrefill && (
        <KnowledgeBaseCreator
          prefill={lorebookPrefill}
          onClose={() => setLorebookPrefill(null)}
          onGenerated={() => setLorebookPrefill(null)}
        />
      )}
    </>
  );
}
