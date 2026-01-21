import { useState } from 'react';
import { Search, Trophy, Calendar } from 'lucide-react';
import { Input } from '../ui/input';
import { Select } from '../ui/select';
import { QuestCard } from './QuestCard';
import { useQuests } from '../../hooks/useQuests';
import type { QuestType } from '../../types/quest';

export const QuestHistory = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<QuestType | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const { data: quests, isLoading } = useQuests({
    status: 'completed',
    limit: 100,
  });

  const filteredQuests = quests?.filter((quest) => {
    if (searchQuery && !quest.title.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !quest.description?.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    if (typeFilter !== 'all' && quest.quest_type !== typeFilter) {
      return false;
    }
    if (categoryFilter !== 'all' && quest.category !== categoryFilter) {
      return false;
    }
    return true;
  }) || [];

  // Get unique categories
  const categories = Array.from(new Set(quests?.map(q => q.category).filter(Boolean) || []));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-white/60">Loading completed quests...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Trophy className="h-8 w-8 text-yellow-400" />
        <div>
          <h1 className="text-2xl font-bold text-white">Hall of Fame</h1>
          <p className="text-white/60 mt-1">Your completed quests and achievements</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/40" />
          <Input
            placeholder="Search completed quests..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-black/40 border-border/60"
          />
        </div>
        <Select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as QuestType | 'all')}
          className="w-40 bg-black/40 border-border/60"
        >
          <option value="all">All Types</option>
          <option value="main">Main Quests</option>
          <option value="side">Side Quests</option>
          <option value="daily">Daily Quests</option>
          <option value="achievement">Achievements</option>
        </Select>
        <Select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="w-40 bg-black/40 border-border/60"
        >
          <option value="all">All Categories</option>
          {categories.map((cat) => (
            <option key={cat} value={cat || ''}>
              {cat}
            </option>
          ))}
        </Select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-black/40 rounded-lg p-4">
          <div className="text-2xl font-bold text-white">{filteredQuests.length}</div>
          <div className="text-sm text-white/60">Completed Quests</div>
        </div>
        <div className="bg-black/40 rounded-lg p-4">
          <div className="text-2xl font-bold text-white">
            {filteredQuests.reduce((sum, q) => sum + (q.impact || 0), 0)}
          </div>
          <div className="text-sm text-white/60">Total Impact</div>
        </div>
        <div className="bg-black/40 rounded-lg p-4">
          <div className="text-2xl font-bold text-white">
            {filteredQuests.filter(q => q.completion_notes).length}
          </div>
          <div className="text-sm text-white/60">With Reflections</div>
        </div>
      </div>

      {/* Quest Grid */}
      {filteredQuests.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredQuests
            .sort((a, b) => {
              const aDate = a.completed_at ? new Date(a.completed_at).getTime() : 0;
              const bDate = b.completed_at ? new Date(b.completed_at).getTime() : 0;
              return bDate - aDate; // Most recent first
            })
            .map((quest) => (
              <div key={quest.id} className="relative">
                <QuestCard quest={quest} />
                {quest.completed_at && (
                  <div className="absolute top-2 right-2 flex items-center gap-1 text-xs text-white/60 bg-black/60 rounded px-2 py-1">
                    <Calendar className="h-3 w-3" />
                    {new Date(quest.completed_at).toLocaleDateString()}
                  </div>
                )}
              </div>
            ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
          <Trophy className="h-16 w-16 text-white/20 mb-4" />
          <p className="text-white/60 text-lg mb-2">No completed quests found</p>
          <p className="text-white/40">
            {searchQuery || typeFilter !== 'all' || categoryFilter !== 'all'
              ? 'Try adjusting your filters'
              : 'Complete your first quest to see it here'}
          </p>
        </div>
      )}
    </div>
  );
};
