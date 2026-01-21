import { useState } from 'react';
import { Search, Filter, Grid, List, Plus } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { QuestCard } from './QuestCard';
import { QuestForm } from './QuestForm';
import { QuestDetailModal } from './QuestDetailModal';
import { useQuestBoard, useStartQuest, usePauseQuest, useCompleteQuest, useAbandonQuest } from '../../hooks/useQuests';
import type { Quest } from '../../types/quest';

export const QuestBoard = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showQuestForm, setShowQuestForm] = useState(false);
  const [selectedQuestId, setSelectedQuestId] = useState<string | null>(null);
  const { data: board, isLoading, error } = useQuestBoard();
  const startQuest = useStartQuest();
  const pauseQuest = usePauseQuest();
  const completeQuest = useCompleteQuest();
  const abandonQuest = useAbandonQuest();

  const handleStart = async (questId: string) => {
    await startQuest.mutateAsync(questId);
  };

  const handlePause = async (questId: string) => {
    await pauseQuest.mutateAsync(questId);
  };

  const handleComplete = async (questId: string) => {
    await completeQuest.mutateAsync({ questId });
  };

  const handleAbandon = async (questId: string) => {
    if (confirm('Are you sure you want to abandon this quest?')) {
      await abandonQuest.mutateAsync({ questId });
    }
  };

  const filterQuests = (quests: Quest[]) => {
    if (!searchQuery) return quests;
    const query = searchQuery.toLowerCase();
    return quests.filter(
      q =>
        q.title.toLowerCase().includes(query) ||
        q.description?.toLowerCase().includes(query) ||
        q.tags?.some(tag => tag.toLowerCase().includes(query))
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-white/60">Loading quests...</div>
      </div>
    );
  }

  if (error && !board) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <div className="text-red-400">Failed to load quests</div>
        <div className="text-white/60 text-sm">Using mock data for demonstration</div>
      </div>
    );
  }

  if (!board) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-white/60">Loading quests...</div>
      </div>
    );
  }

  const filteredMainQuests = filterQuests(board.main_quests);
  const filteredSideQuests = filterQuests(board.side_quests);
  const filteredDailyQuests = filterQuests(board.daily_quests);
  const filteredCompletedQuests = filterQuests(board.completed_quests);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Quest Board</h1>
          <p className="text-white/60 mt-1">Manage your goals, todos, and quests</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
          >
            {viewMode === 'grid' ? <List className="h-4 w-4" /> : <Grid className="h-4 w-4" />}
          </Button>
          <Button
            onClick={() => setShowQuestForm(true)}
            leftIcon={<Plus className="h-4 w-4" />}
          >
            Create Quest
          </Button>
        </div>
      </div>

      {/* Quest Form Modal */}
      {showQuestForm && (
        <QuestForm
          onClose={() => setShowQuestForm(false)}
          onSuccess={() => {
            setShowQuestForm(false);
            // Data will refresh automatically via React Query
          }}
        />
      )}

      {/* Quest Detail Modal */}
      {selectedQuestId && (
        <QuestDetailModal
          questId={selectedQuestId}
          onClose={() => setSelectedQuestId(null)}
        />
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/40" />
        <Input
          placeholder="Search quests..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 bg-black/40 border-border/60"
        />
      </div>

      {/* Main Quests */}
      {filteredMainQuests.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-white mb-3">Main Quests</h2>
          <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4' : 'space-y-4'}>
            {filteredMainQuests.map((quest) => (
              <QuestCard
                key={quest.id}
                quest={quest}
                onStart={() => handleStart(quest.id)}
                onPause={() => handlePause(quest.id)}
                onComplete={() => handleComplete(quest.id)}
                onAbandon={() => handleAbandon(quest.id)}
                onClick={() => setSelectedQuestId(quest.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Side Quests */}
      {filteredSideQuests.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-white mb-3">Side Quests</h2>
          <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4' : 'space-y-4'}>
            {filteredSideQuests.map((quest) => (
              <QuestCard
                key={quest.id}
                quest={quest}
                onStart={() => handleStart(quest.id)}
                onPause={() => handlePause(quest.id)}
                onComplete={() => handleComplete(quest.id)}
                onAbandon={() => handleAbandon(quest.id)}
                onClick={() => setSelectedQuestId(quest.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Daily Quests */}
      {filteredDailyQuests.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-white mb-3">Daily Quests</h2>
          <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4' : 'space-y-4'}>
            {filteredDailyQuests.map((quest) => (
              <QuestCard
                key={quest.id}
                quest={quest}
                onStart={() => handleStart(quest.id)}
                onPause={() => handlePause(quest.id)}
                onComplete={() => handleComplete(quest.id)}
                onAbandon={() => handleAbandon(quest.id)}
                onClick={() => setSelectedQuestId(quest.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Completed Quests (Hall of Fame) */}
      {filteredCompletedQuests.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-white mb-3">Completed Quests</h2>
          <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4' : 'space-y-4'}>
            {filteredCompletedQuests.map((quest) => (
              <QuestCard key={quest.id} quest={quest} onClick={() => setSelectedQuestId(quest.id)} />
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {filteredMainQuests.length === 0 &&
        filteredSideQuests.length === 0 &&
        filteredDailyQuests.length === 0 &&
        filteredCompletedQuests.length === 0 && (
          <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
            <p className="text-white/60 text-lg mb-2">No quests found</p>
            <p className="text-white/40">
              {searchQuery ? 'Try adjusting your search query' : 'Create your first quest to get started'}
            </p>
          </div>
        )}
    </div>
  );
};
