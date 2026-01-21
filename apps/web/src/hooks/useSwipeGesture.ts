import { useRef, useCallback } from 'react';

export interface SwipeGestureOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  threshold?: number; // Minimum distance in pixels to trigger swipe
  preventDefault?: boolean;
}

export interface SwipeState {
  isSwiping: boolean;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  deltaX: number;
  deltaY: number;
}

/**
 * Hook for detecting swipe gestures
 */
export function useSwipeGesture(options: SwipeGestureOptions = {}) {
  const {
    onSwipeLeft,
    onSwipeRight,
    threshold = 50,
    preventDefault = true
  } = options;

  const stateRef = useRef<SwipeState>({
    isSwiping: false,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    deltaX: 0,
    deltaY: 0
  });

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    stateRef.current = {
      isSwiping: true,
      startX: touch.clientX,
      startY: touch.clientY,
      currentX: touch.clientX,
      currentY: touch.clientY,
      deltaX: 0,
      deltaY: 0
    };
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!stateRef.current.isSwiping) return;

    const touch = e.touches[0];
    const deltaX = touch.clientX - stateRef.current.startX;
    const deltaY = touch.clientY - stateRef.current.startY;

    stateRef.current.currentX = touch.clientX;
    stateRef.current.currentY = touch.clientY;
    stateRef.current.deltaX = deltaX;
    stateRef.current.deltaY = deltaY;

    if (preventDefault && Math.abs(deltaX) > 10) {
      e.preventDefault();
    }
  }, [preventDefault]);

  const handleTouchEnd = useCallback(() => {
    const state = stateRef.current;
    
    if (!state.isSwiping) return;

    const absDeltaX = Math.abs(state.deltaX);
    const absDeltaY = Math.abs(state.deltaY);

    // Only trigger if horizontal swipe is dominant
    if (absDeltaX > absDeltaY && absDeltaX > threshold) {
      if (state.deltaX > 0) {
        // Swiped right (previous page)
        onSwipeRight?.();
      } else {
        // Swiped left (next page)
        onSwipeLeft?.();
      }
    }

    // Reset state
    stateRef.current = {
      isSwiping: false,
      startX: 0,
      startY: 0,
      currentX: 0,
      currentY: 0,
      deltaX: 0,
      deltaY: 0
    };
  }, [onSwipeLeft, onSwipeRight, threshold]);

  const getSwipeState = useCallback((): SwipeState => {
    return { ...stateRef.current };
  }, []);

  return {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
    getSwipeState
  };
}
