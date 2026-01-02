/**
 * useIntersectionObserver Hook
 * 
 * Observes when an element enters or leaves the viewport
 * Useful for lazy loading, infinite scroll, animations, etc.
 */

import { useEffect, useRef, useState, RefObject } from 'react';

export interface UseIntersectionObserverOptions extends IntersectionObserverInit {
  /**
   * Whether to observe immediately or wait for manual trigger
   */
  immediate?: boolean;
}

export interface UseIntersectionObserverResult {
  /**
   * Ref to attach to the element to observe
   */
  ref: RefObject<Element>;
  
  /**
   * Whether the element is currently intersecting
   */
  isIntersecting: boolean;
  
  /**
   * The intersection ratio (0-1)
   */
  intersectionRatio: number;
  
  /**
   * The IntersectionObserverEntry
   */
  entry: IntersectionObserverEntry | null;
  
  /**
   * Manually start observing
   */
  observe: () => void;
  
  /**
   * Manually stop observing
   */
  unobserve: () => void;
}

/**
 * Hook to observe when an element enters or leaves the viewport
 */
export function useIntersectionObserver(
  options: UseIntersectionObserverOptions = {}
): UseIntersectionObserverResult {
  const {
    threshold = 0,
    root = null,
    rootMargin = '0px',
    immediate = true,
  } = options;

  const elementRef = useRef<Element>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const [entry, setEntry] = useState<IntersectionObserverEntry | null>(null);
  const [isObserving, setIsObserving] = useState(immediate);

  useEffect(() => {
    const element = elementRef.current;
    if (!element || !isObserving) {
      return;
    }

    observerRef.current = new IntersectionObserver(
      ([entry]) => {
        setEntry(entry);
      },
      {
        threshold,
        root,
        rootMargin,
      }
    );

    observerRef.current.observe(element);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [threshold, root, rootMargin, isObserving]);

  const observe = () => {
    setIsObserving(true);
  };

  const unobserve = () => {
    setIsObserving(false);
    if (observerRef.current) {
      observerRef.current.disconnect();
    }
  };

  return {
    ref: elementRef as RefObject<Element>,
    isIntersecting: entry?.isIntersecting ?? false,
    intersectionRatio: entry?.intersectionRatio ?? 0,
    entry,
    observe,
    unobserve,
  };
}

