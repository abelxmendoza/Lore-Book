import React, { useState } from 'react';
import { Calendar, Clock, Layers } from 'lucide-react';
import { useChronology, useChronologyOverlaps } from '../../hooks/useChronology';
import { MemoryCard } from '../timeline-v2/MemoryCard';
import type { ChronologyEntry } from '../../types/timelineV2';

type ViewMode = 'chronological' | 'narrative';

export const ChronologyView: React.FC = () => {
  const [viewMode, setViewMode] = useState<ViewMode>('chronological');
  const { entries, loading } = useChronology();
  const { overlaps } = useChronologyOverlaps();

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Master Chronology</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Objective time ordering of all memories
            </p>
          </div>

          {/* Mode Toggle */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode('chronological')}
              className={`flex items-center gap-2 px-4 py-2 rounded ${
                viewMode === 'chronological'
                  ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
              }`}
            >
              <Clock className="w-4 h-4" />
              Chronological
            </button>
            <button
              onClick={() => setViewMode('narrative')}
              className={`flex items-center gap-2 px-4 py-2 rounded ${
                viewMode === 'narrative'
                  ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
              }`}
            >
              <Layers className="w-4 h-4" />
              Narrative
            </button>
          </div>
        </div>
      </div>

      {/* Overlap Warnings */}
      {overlaps.length > 0 && (
        <div className="mx-4 mt-4 p-3 bg-yellow-50 dark:bg-yellow-900 border border-yellow-200 dark:border-yellow-700 rounded">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
            <span className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
              {overlaps.length} overlapping period{overlaps.length !== 1 ? 's' : ''} detected
            </span>
          </div>
        </div>
      )}

      {/* Chronology List */}
      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="text-center text-gray-500 dark:text-gray-400 py-8">Loading...</div>
        ) : entries.length === 0 ? (
          <div className="text-center text-gray-500 dark:text-gray-400 py-8">
            No chronology entries found
          </div>
        ) : (
          <div className="space-y-4">
            {entries.map((entry, index) => (
              <div key={entry.id} className="flex items-start gap-4">
                {/* Timeline Marker */}
                <div className="flex flex-col items-center">
                  <div className="w-3 h-3 rounded-full bg-blue-600 dark:bg-blue-400" />
                  {index < entries.length - 1 && (
                    <div className="w-0.5 h-full bg-gray-300 dark:bg-gray-600 min-h-[80px]" />
                  )}
                </div>

                {/* Entry Card */}
                <div className="flex-1">
                  <MemoryCard entry={entry} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
