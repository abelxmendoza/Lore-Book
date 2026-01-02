import { useEffect } from 'react';
import { TimelineEntryModal } from '../timeline/TimelineEntryModal';
import { fetchJson } from '../../lib/api';
import type { ChatSource } from './ChatMessage';

type ChatSourceNavigatorProps = {
  source: ChatSource | null;
  onClose: () => void;
  onNavigateToSurface?: (surface: 'timeline' | 'characters' | 'memoir', id?: string) => void;
};

export const ChatSourceNavigator = ({ source, onClose, onNavigateToSurface }: ChatSourceNavigatorProps) => {
  if (!source) return null;

  // Handle entry navigation
  if (source.type === 'entry') {
    return (
      <TimelineEntryModal
        entryId={source.id}
        isOpen={true}
        onClose={onClose}
        onNavigate={(entryId) => {
          // Navigate to new entry
          if (onNavigateToSurface) {
            onNavigateToSurface('timeline', entryId);
          }
        }}
      />
    );
  }

  // Handle chapter navigation
  if (source.type === 'chapter') {
    return (
      <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full bg-black/90 border border-border/60 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white">Chapter: {source.title}</h2>
            <button
              onClick={onClose}
              className="text-white/60 hover:text-white transition-colors text-2xl"
            >
              ×
            </button>
          </div>
          {source.snippet && (
            <p className="text-white/80 mb-4">{source.snippet}</p>
          )}
          {source.date && (
            <p className="text-white/60 text-sm mb-4">
              Date: {new Date(source.date).toLocaleDateString()}
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => {
                if (onNavigateToSurface) {
                  onNavigateToSurface('timeline', source.id);
                  onClose();
                }
              }}
              className="px-4 py-2 bg-primary/20 border border-primary/50 rounded hover:bg-primary/30 transition-colors text-primary"
            >
              View in Timeline
            </button>
            <button
              onClick={() => {
                if (onNavigateToSurface) {
                  onNavigateToSurface('memoir', source.id);
                  onClose();
                }
              }}
              className="px-4 py-2 bg-primary/20 border border-primary/50 rounded hover:bg-primary/30 transition-colors text-primary"
            >
              View in Memoir
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Handle character navigation
  if (source.type === 'character') {
    return (
      <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full bg-black/90 border border-border/60 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white">Character: {source.title}</h2>
            <button
              onClick={onClose}
              className="text-white/60 hover:text-white transition-colors text-2xl"
            >
              ×
            </button>
          </div>
          {source.snippet && (
            <p className="text-white/80 mb-4">{source.snippet}</p>
          )}
          <button
            onClick={() => {
              if (onNavigateToSurface) {
                onNavigateToSurface('characters', source.id);
                onClose();
              }
            }}
            className="px-4 py-2 bg-primary/20 border border-primary/50 rounded hover:bg-primary/30 transition-colors text-primary"
          >
            View Character Profile
          </button>
        </div>
      </div>
    );
  }

  // Generic source display
  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-black/90 border border-border/60 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <span className="text-xs text-primary/70 uppercase">{source.type}</span>
            <h2 className="text-xl font-semibold text-white mt-1">{source.title}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white transition-colors text-2xl"
          >
            ×
          </button>
        </div>
        {source.snippet && (
          <p className="text-white/80 mb-4">{source.snippet}</p>
        )}
        {source.date && (
          <p className="text-white/60 text-sm">
            Date: {new Date(source.date).toLocaleDateString()}
          </p>
        )}
      </div>
    </div>
  );
};

