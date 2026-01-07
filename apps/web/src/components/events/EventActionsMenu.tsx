// =====================================================
// EVENT ACTIONS MENU
// Purpose: Contextual actions for controlling event meaning
// =====================================================

import { useState, useRef, useEffect } from 'react';
import { MoreVertical, Archive, X, AlertCircle, MessageSquare, Clock, EyeOff, TrendingDown } from 'lucide-react';
import { Button } from '../ui/button';
import { fetchJson } from '../../lib/api';

interface EventActionsMenuProps {
  eventId: string;
  onOverrideApplied?: () => void;
}

export const EventActionsMenu: React.FC<EventActionsMenuProps> = ({
  eventId,
  onOverrideApplied,
}) => {
  const [applying, setApplying] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleOverride = async (overrideType: string, label: string) => {
    if (applying) return;

    setApplying(true);
    setIsOpen(false);
    try {
      await fetchJson('/api/meta/override', {
        method: 'POST',
        body: JSON.stringify({
          scope: 'EVENT',
          target_id: eventId,
          override_type: overrideType,
        }),
      });

      onOverrideApplied?.();
      // Could show a toast notification here
    } catch (err: any) {
      console.error('Failed to apply override:', err);
      alert(`Failed to mark as ${label.toLowerCase()}. Please try again.`);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <Button
        variant="ghost"
        size="sm"
        disabled={applying}
        onClick={() => setIsOpen(!isOpen)}
      >
        <MoreVertical className="w-4 h-4" />
      </Button>
      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-black border border-border/60 rounded-lg shadow-lg z-50 overflow-hidden">
          <button
            onClick={() => handleOverride('NOT_IMPORTANT', 'not important')}
            disabled={applying}
            className="w-full px-4 py-2 text-left text-sm hover:bg-white/10 flex items-center gap-2 disabled:opacity-50"
          >
            <EyeOff className="w-4 h-4" />
            This isn't important
          </button>
          <button
            onClick={() => handleOverride('JUST_VENTING', 'just venting')}
            disabled={applying}
            className="w-full px-4 py-2 text-left text-sm hover:bg-white/10 flex items-center gap-2 disabled:opacity-50"
          >
            <MessageSquare className="w-4 h-4" />
            This was just venting
          </button>
          <button
            onClick={() => handleOverride('OUTDATED', 'outdated')}
            disabled={applying}
            className="w-full px-4 py-2 text-left text-sm hover:bg-white/10 flex items-center gap-2 disabled:opacity-50"
          >
            <Clock className="w-4 h-4" />
            This doesn't represent me anymore
          </button>
          <div className="border-t border-border/60 my-1" />
          <button
            onClick={() => handleOverride('DO_NOT_TRACK_PATTERN', 'pattern tracking')}
            disabled={applying}
            className="w-full px-4 py-2 text-left text-sm hover:bg-white/10 flex items-center gap-2 disabled:opacity-50"
          >
            <X className="w-4 h-4" />
            Stop tracking this pattern
          </button>
          <button
            onClick={() => handleOverride('LOWER_CONFIDENCE', 'confidence')}
            disabled={applying}
            className="w-full px-4 py-2 text-left text-sm hover:bg-white/10 flex items-center gap-2 disabled:opacity-50"
          >
            <TrendingDown className="w-4 h-4" />
            Lower confidence in this
          </button>
          <div className="border-t border-border/60 my-1" />
          <button
            onClick={() => handleOverride('ARCHIVE', 'archived')}
            disabled={applying}
            className="w-full px-4 py-2 text-left text-sm hover:bg-red-500/10 text-red-400 flex items-center gap-2 disabled:opacity-50"
          >
            <Archive className="w-4 h-4" />
            Archive this moment
          </button>
        </div>
      )}
    </div>
  );
};

