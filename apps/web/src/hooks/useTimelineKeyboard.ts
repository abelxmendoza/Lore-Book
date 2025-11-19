import { useEffect, useCallback } from 'react';

type TimelineKeyboardControls = {
  onPanLeft: () => void;
  onPanRight: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onJumpToStart: () => void;
  onJumpToEnd: () => void;
  onJumpToToday: () => void;
  enabled?: boolean;
};

export const useTimelineKeyboard = ({
  onPanLeft,
  onPanRight,
  onZoomIn,
  onZoomOut,
  onJumpToStart,
  onJumpToEnd,
  onJumpToToday,
  enabled = true
}: TimelineKeyboardControls) => {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!enabled) return;
    
    // Don't trigger if user is typing in an input
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return;
    }
    
    // Handle arrow keys for panning
    if (e.key === 'ArrowLeft' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      onPanLeft();
    } else if (e.key === 'ArrowRight' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      onPanRight();
    }
    
    // Handle zoom with +/- or [ ]
    if ((e.key === '+' || e.key === '=') && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      onZoomIn();
    } else if (e.key === '-' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      onZoomOut();
    } else if (e.key === ']' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      onZoomIn();
    } else if (e.key === '[' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      onZoomOut();
    }
    
    // Handle Home/End for jumping
    if (e.key === 'Home' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      onJumpToStart();
    } else if (e.key === 'End' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      onJumpToEnd();
    }
    
    // Handle T for "Today"
    if (e.key === 't' || e.key === 'T') {
      if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault();
        onJumpToToday();
      }
    }
  }, [enabled, onPanLeft, onPanRight, onZoomIn, onZoomOut, onJumpToStart, onJumpToEnd, onJumpToToday]);
  
  useEffect(() => {
    if (enabled) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [enabled, handleKeyDown]);
};

