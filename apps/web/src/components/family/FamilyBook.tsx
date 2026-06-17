import { useCallback, useEffect, useState } from 'react';
import { TreePine, Home, Users, BarChart3, Loader2, GitBranch } from 'lucide-react';
import { fetchJson } from '../../lib/api';
import { booksApi } from '../../api/books';
import { onStoryDataUpdated } from '../../lib/storyRefresh';
import { useShouldUseMockData } from '../../hooks/useShouldUseMockData';
import { DEMO_FAMILY_SUMMARY, DEMO_FAMILY_CHARACTERS_BY_ID } from '../../mocks/family';
import { FamilyTreePanel } from './FamilyTreePanel';
import { HierarchicalFamilyTree } from './HierarchicalFamilyTree';
import { FamilyTreeView } from './FamilyTreeView';
import { HouseholdDirectory, type HouseholdDTO } from './HouseholdDirectory';
import { FamilyAnalyticsPanel, type RelationshipAnalyticDTO } from './FamilyAnalyticsPanel';
import { FamilyExtendedNetworkPanel } from './FamilyExtendedNetworkPanel';
import { CharacterDetailModal } from '../characters/CharacterDetailModal';
import type { FamilyTree } from '../../types/socialRoles';
import type { Character } from '../characters/CharacterProfileCard';

type Tab = 'tree' | 'households' | 'groups' | 'analytics' | 'extended';

type SummaryResponse = {
  success: boolean;
  tree: FamilyTree;
  households: HouseholdDTO[];
  familyGroups: Array<{ id: string; name: string; metadata?: Record<string, unknown> }>;
  analytics: RelationshipAnalyticDTO[];
};

export function FamilyBook() {
  const shouldUseMock = useShouldUseMockData();
  const [tab, setTab] = useState<Tab>('tree');
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const [viewMode, setViewMode] = useState<'hierarchical' | 'visual'>('hierarchical');

  const load = useCallback(async () => {
    if (shouldUseMock) {
      setSummary(DEMO_FAMILY_SUMMARY);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = await booksApi.loadFamily();
      if (data.tree) setSummary({ success: true, ...data } as SummaryResponse);
    } catch {
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [shouldUseMock]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => onStoryDataUpdated(() => { void load(); }, 'family'), [load]);

  const openCharacter = async (characterId: string, name: string) => {
    if (characterId.startsWith('head-') || characterId.startsWith('group-') || characterId.startsWith('__')) return;

    if (shouldUseMock) {
      const mockCharacter = DEMO_FAMILY_CHARACTERS_BY_ID[characterId];
      setSelectedCharacter(
        mockCharacter ?? ({ id: characterId, name, user_id: '', status: 'active' } as Character)
      );
      return;
    }

    try {
      const r = await fetchJson<{ character?: Character }>(`/api/characters/${characterId}`);
      if (r.character) setSelectedCharacter(r.character);
      else setSelectedCharacter({ id: characterId, name, user_id: '', status: 'active' } as Character);
    } catch {
      setSelectedCharacter({ id: characterId, name, user_id: '', status: 'active' } as Character);
    }
  };

  const tabs: Array<{ key: Tab; label: string; icon: typeof TreePine }> = [
    { key: 'tree', label: 'Family Tree', icon: TreePine },
    { key: 'households', label: 'Households', icon: Home },
    { key: 'groups', label: 'Family Groups', icon: Users },
    { key: 'analytics', label: 'Analytics', icon: BarChart3 },
    { key: 'extended', label: 'Extended family', icon: GitBranch },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-semibold text-white flex items-center gap-3">
          <TreePine className="h-7 w-7 text-emerald-400" />
          Family
          {shouldUseMock && (
            <span className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full border border-emerald-500/35 bg-emerald-500/10 text-emerald-200">
              Demo mode
            </span>
          )}
        </h1>
        <p className="text-sm text-white/55 max-w-2xl">
          Living family graphs inferred from your conversations — trees, households, groups, and relationship strength.
        </p>
      </header>

      <nav className="flex flex-wrap gap-2 border-b border-white/10 pb-3">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition ${
              tab === key
                ? 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/30'
                : 'text-white/55 hover:text-white/80 hover:bg-white/5'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </nav>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-white/50">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading family graph…
        </div>
      ) : (
        <>
          {tab === 'tree' && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setViewMode('hierarchical')}
                  className={`text-xs px-3 py-1.5 rounded-lg border ${viewMode === 'hierarchical' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' : 'border-white/10 text-white/50'}`}
                >
                  Tree view
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('visual')}
                  className={`text-xs px-3 py-1.5 rounded-lg border ${viewMode === 'visual' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' : 'border-white/10 text-white/50'}`}
                >
                  Visual graph
                </button>
              </div>
              {viewMode === 'hierarchical' && summary?.tree?.members?.length ? (
                <HierarchicalFamilyTree
                  tree={summary.tree}
                  onMemberClick={(m) => void openCharacter(m.id, m.name)}
                />
              ) : shouldUseMock && summary?.tree?.members?.length ? (
                <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                  <FamilyTreeView
                    tree={summary.tree}
                    onMemberClick={(m) => void openCharacter(m.id, m.name)}
                  />
                </div>
              ) : (
                <FamilyTreePanel
                  scope="mine"
                  title="Your family tree"
                  hint="Mention relatives in chat — LoreBook builds your tree automatically."
                  onMemberClick={(id, name) => void openCharacter(id, name)}
                />
              )}
            </div>
          )}

          {tab === 'households' && (
            <HouseholdDirectory
              households={summary?.households ?? []}
              onMemberClick={(id, name) => void openCharacter(id, name)}
            />
          )}

          {tab === 'groups' && (
            <div className="grid gap-3 sm:grid-cols-2">
              {(summary?.familyGroups ?? []).length === 0 ? (
                <p className="text-sm text-white/45 col-span-2 py-8 text-center">
                  Family groups form when multiple relatives appear together in chat.
                </p>
              ) : (
                summary!.familyGroups.map((g) => (
                  <article
                    key={g.id}
                    className="rounded-xl border border-purple-500/25 bg-purple-950/20 p-4"
                  >
                    <h3 className="font-medium text-white flex items-center gap-2">
                      <Users className="h-4 w-4 text-purple-400" />
                      {g.name}
                    </h3>
                    <p className="text-xs text-white/40 mt-2">Inferred from kinship co-mentions</p>
                    {!!g.metadata && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {Object.entries(g.metadata).map(([k, v]) => (
                          <span
                            key={`${g.id}-${k}`}
                            className="text-[10px] px-1.5 py-0.5 rounded border border-purple-400/20 bg-purple-500/10 text-purple-200/80"
                          >
                            {k}: {String(v)}
                          </span>
                        ))}
                      </div>
                    )}
                  </article>
                ))
              )}
            </div>
          )}

          {tab === 'analytics' && (
            <FamilyAnalyticsPanel
              analytics={summary?.analytics ?? []}
              onMemberClick={(id, name) => void openCharacter(id, name)}
            />
          )}

          {tab === 'extended' && (
            <FamilyExtendedNetworkPanel
              onMemberClick={(id, name) => void openCharacter(id, name)}
            />
          )}
        </>
      )}

      {selectedCharacter && (
        <CharacterDetailModal
          character={selectedCharacter}
          onClose={() => setSelectedCharacter(null)}
          onUpdate={(c) => setSelectedCharacter(c)}
        />
      )}
    </div>
  );
}
