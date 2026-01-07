import React from 'react';
import { X } from 'lucide-react';
import { Button } from '../ui/button';
import { EventCardExample } from './EventCardExample';

interface EventCardExampleModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const EventCardExampleModal: React.FC<EventCardExampleModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-6xl mx-4 max-h-[90vh] overflow-y-auto bg-black/95 border border-primary/50 rounded-lg shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between p-4 border-b border-primary/30 bg-black/95 backdrop-blur-sm">
          <div>
            <h2 className="text-xl font-semibold text-white">Understanding Event Cards</h2>
            <p className="text-sm text-white/60 mt-1">
              Hover over elements on event cards to see what they mean, or review this example below.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-white/70 hover:text-white hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-6">
          <EventCardExample onClose={onClose} />
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex items-center justify-end gap-3 p-4 border-t border-primary/30 bg-black/95 backdrop-blur-sm">
          <p className="text-xs text-white/50 mr-auto">
            💡 Tip: Hover over any element on event cards to see explanations
          </p>
          <Button onClick={onClose} variant="default">
            Got it
          </Button>
        </div>
      </div>
    </div>
  );
};

