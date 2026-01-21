import { TrendingUp, Target, Clock, CheckCircle, XCircle } from 'lucide-react';
import { useQuestAnalytics } from '../../hooks/useQuests';

export const QuestAnalytics = () => {
  const { data: analytics, isLoading, error } = useQuestAnalytics();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-white/60">Loading analytics...</div>
      </div>
    );
  }

  if (error || !analytics) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-red-400">Failed to load analytics</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Quest Analytics</h1>
        <p className="text-white/60 mt-1">Insights into your quest progress and patterns</p>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-black/40 rounded-lg p-4">
          <div className="flex items-center gap-2 text-white/60 text-sm mb-2">
            <Target className="h-4 w-4" />
            Total Quests
          </div>
          <div className="text-3xl font-bold text-white">{analytics.total_quests}</div>
        </div>
        <div className="bg-black/40 rounded-lg p-4">
          <div className="flex items-center gap-2 text-white/60 text-sm mb-2">
            <CheckCircle className="h-4 w-4" />
            Completed
          </div>
          <div className="text-3xl font-bold text-green-400">{analytics.completed_quests}</div>
        </div>
        <div className="bg-black/40 rounded-lg p-4">
          <div className="flex items-center gap-2 text-white/60 text-sm mb-2">
            <TrendingUp className="h-4 w-4" />
            Completion Rate
          </div>
          <div className="text-3xl font-bold text-white">
            {Math.round(analytics.completion_rate * 100)}%
          </div>
        </div>
        <div className="bg-black/40 rounded-lg p-4">
          <div className="flex items-center gap-2 text-white/60 text-sm mb-2">
            <Clock className="h-4 w-4" />
            Avg Time
          </div>
          <div className="text-3xl font-bold text-white">
            {analytics.average_completion_time_hours
              ? `${Math.round(analytics.average_completion_time_hours)}h`
              : 'N/A'}
          </div>
        </div>
      </div>

      {/* By Type */}
      <div className="bg-black/40 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Quests by Type</h2>
        <div className="grid grid-cols-4 gap-4">
          {Object.entries(analytics.by_type).map(([type, count]) => (
            <div key={type} className="text-center">
              <div className="text-2xl font-bold text-white">{count}</div>
              <div className="text-sm text-white/60 capitalize">{type}</div>
            </div>
          ))}
        </div>
      </div>

      {/* By Status */}
      <div className="bg-black/40 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Quests by Status</h2>
        <div className="grid grid-cols-5 gap-4">
          {Object.entries(analytics.by_status).map(([status, count]) => (
            <div key={status} className="text-center">
              <div className="text-2xl font-bold text-white">{count}</div>
              <div className="text-sm text-white/60 capitalize">{status}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Average Rankings */}
      <div className="bg-black/40 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Average Rankings</h2>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-white">{analytics.average_priority.toFixed(1)}</div>
            <div className="text-sm text-white/60">Priority</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-white">{analytics.average_importance.toFixed(1)}</div>
            <div className="text-sm text-white/60">Importance</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-white">{analytics.average_impact.toFixed(1)}</div>
            <div className="text-sm text-white/60">Impact</div>
          </div>
        </div>
      </div>

      {/* Most Impactful Quests */}
      {analytics.most_impactful_quests.length > 0 && (
        <div className="bg-black/40 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Most Impactful Quests</h2>
          <div className="space-y-2">
            {analytics.most_impactful_quests.slice(0, 5).map((quest) => (
              <div key={quest.id} className="flex items-center justify-between bg-black/60 rounded-lg p-3">
                <div>
                  <div className="text-white font-medium">{quest.title}</div>
                  <div className="text-sm text-white/60">Impact: {quest.impact}</div>
                </div>
                <div className="text-sm text-white/40">
                  {quest.completed_at
                    ? new Date(quest.completed_at).toLocaleDateString()
                    : quest.status}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Activity Timeline */}
      {analytics.quest_activity_timeline.length > 0 && (
        <div className="bg-black/40 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Activity Timeline (Last 30 Days)</h2>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {analytics.quest_activity_timeline
              .filter(day => day.created > 0 || day.completed > 0 || day.abandoned > 0)
              .map((day) => (
                <div key={day.date} className="flex items-center justify-between bg-black/60 rounded-lg p-3">
                  <div className="text-sm text-white/60">
                    {new Date(day.date).toLocaleDateString()}
                  </div>
                  <div className="flex gap-4 text-sm">
                    <span className="text-green-400">+{day.created}</span>
                    <span className="text-blue-400">✓{day.completed}</span>
                    <span className="text-red-400">✗{day.abandoned}</span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
};
