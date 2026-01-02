import React, { useState, useEffect } from 'react';
import { X, Calendar, Clock, Tag, Users, MapPin, ExternalLink } from 'lucide-react';
import { fetchJson } from '../../lib/api';
import type { ChronologyEntry } from '../../types/timelineV2';
import type { MemoryEntry } from '../../types';

interface MemoryDetailModalProps {
  entry: ChronologyEntry;
  onClose: () => void;
}

export const MemoryDetailModal: React.FC<MemoryDetailModalProps> = ({ entry, onClose }) => {
  const [fullEntry, setFullEntry] = useState<MemoryEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [timelineNames, setTimelineNames] = useState<Record<string, string>>({});

  useEffect(() => {
    loadFullEntry();
  }, [entry.journal_entry_id]);

  const loadFullEntry = async () => {
    try {
      setLoading(true);
      const response = await fetchJson<{ entry: MemoryEntry }>(`/api/entries/${entry.journal_entry_id}`);
      setFullEntry(response.entry);

      // Load timeline names
      if (entry.timeline_memberships.length > 0) {
        const timelinePromises = entry.timeline_memberships.map(async (timelineId) => {
          try {
            const timelineRes = await fetchJson<{ timeline: { id: string; title: string } }>(
              `/api/timeline-v2/${timelineId}`
            );
            return [timelineId, timelineRes.timeline.title];
          } catch {
            return [timelineId, 'Unknown Timeline'];
          }
        });
        const names = await Promise.all(timelinePromises);
        setTimelineNames(Object.fromEntries(names));
      }
    } catch (error) {
      console.error('Failed to load full entry:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (time: string, precision: string) => {
    const date = new Date(time);
    switch (precision) {
      case 'year':
        return date.getFullYear().toString();
      case 'month':
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
      case 'day':
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      default:
        return date.toLocaleString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
    }
  };

  const precisionLabel = {
    exact: 'Exact',
    day: 'Day',
    month: 'Month',
    year: 'Year',
    approximate: 'Approximate'
  }[entry.time_precision] || 'Unknown';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/70">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col m-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Memory Details</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">Loading...</div>
          ) : (
            <div className="space-y-6">
              {/* Time Information */}
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Time Information
                </h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-900 dark:text-white">
                      <strong>Start:</strong> {formatTime(entry.start_time, entry.time_precision)}
                    </span>
                  </div>
                  {entry.end_time && (
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-900 dark:text-white">
                        <strong>End:</strong> {formatTime(entry.end_time, entry.time_precision)}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-1 rounded">
                      {precisionLabel}
                    </span>
                    {entry.time_confidence < 1.0 && (
                      <span className="text-xs text-yellow-600 dark:text-yellow-400">
                        {Math.round(entry.time_confidence * 100)}% confidence
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Content */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Content</h3>
                <p className="text-gray-900 dark:text-white whitespace-pre-wrap">
                  {fullEntry?.content || entry.content}
                </p>
              </div>

              {/* Timeline Memberships */}
              {entry.timeline_memberships.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                    <Tag className="w-4 h-4" />
                    Timeline Memberships
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {entry.timeline_memberships.map((timelineId) => (
                      <a
                        key={timelineId}
                        href={`/timeline-v2/${timelineId}`}
                        className="inline-flex items-center gap-1 text-xs bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 px-3 py-1.5 rounded hover:bg-purple-200 dark:hover:bg-purple-800 transition-colors"
                      >
                        {timelineNames[timelineId] || 'Timeline'}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Tags */}
              {fullEntry?.tags && fullEntry.tags.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                    <Tag className="w-4 h-4" />
                    Tags
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {fullEntry.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-1 rounded"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Mood */}
              {fullEntry?.mood && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Mood</h3>
                  <span className="text-sm bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-3 py-1 rounded">
                    {fullEntry.mood}
                  </span>
                </div>
              )}

              {/* Metadata */}
              {fullEntry?.metadata && Object.keys(fullEntry.metadata).length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Metadata</h3>
                  <pre className="text-xs bg-gray-50 dark:bg-gray-900 p-3 rounded overflow-auto">
                    {JSON.stringify(fullEntry.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
