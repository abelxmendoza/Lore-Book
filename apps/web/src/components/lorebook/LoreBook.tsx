import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { BookOpen, ChevronLeft, ChevronRight, BookMarked, MessageSquare, Type, AlignJustify, Loader2, Download, Menu, X, Edit3 } from 'lucide-react';
import { LibraryLanding } from './LibraryLanding';
import { LorebookEmptyState } from './LorebookEmptyState';
import { LorebookRecommendations } from './LorebookRecommendations';
import { BookCoverPage, type ReadingTheme } from './BookCoverPage';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { ChatFirstInterface } from '../../features/chat/components/ChatFirstInterface';
import { KnowledgeBaseCreator } from './KnowledgeBaseCreator';
import { fetchJson } from '../../lib/api';
import { useShouldUseMockData } from '../../hooks/useShouldUseMockData';
import { useLoreKeeper } from '../../hooks/useLoreKeeper';
import { BookPage } from './BookPage';
import { useSwipeGesture } from '../../hooks/useSwipeGesture';
import { calculatePagesForSection, fontSizeToPixels, lineHeightToMultiplier, getViewportDimensions, type BookPage as BookPageType } from '../../utils/pageCalculator';
import { LorebookStats } from './LorebookStats';
import { LoreBookGeneratingScreen, ensureMinGeneratingDuration } from './LoreBookGeneratingScreen';
import {
  DEFAULT_DEMO_LOREBOOK,
} from '../../mocks/lorebooks';
import { resolveDemoLorebookById } from '../../lib/storyForge/forgeDemoLibrary';
import { compileDemoLorebook } from '../../lib/storyForge/demoLorebookWorkflow';
import { useLoreReadinessSimulation } from '../../contexts/LoreReadinessSimulationContext';
import { isDemoBookId, lorebookEditUrl, lorebookEditorUrlForCompiledBooks, lorebookReadUrl } from '../../lib/lorebookLibrary';
import {
  compileLorebookFromQuery,
  compileLorebookFromSpec,
  compileLorebookFromTopic,
  formatCompileBlockMessage,
  shouldConfirmForceCompile,
  type CompileTopicOptions,
} from '../../lib/lorebookCompile';
import { useLoreReadiness } from '../../hooks/useLoreReadiness';
import { useLorebookShell } from './LorebookShell';
import type { LoreTopicId } from '../../lib/loreReadiness';

// Biography types (define locally to avoid server import)
type Biography = {
  id: string;
  user_id: string;
  lorebook_name: string;
  title: string;
  spec: any;
  outline: any;
  sections: any[];
  chapters: Array<{ id: string; title: string; text: string; timeSpan: { start: string; end: string } }>;
  metadata: { generatedAt: string; [key: string]: any };
  created_at: string;
  updated_at: string;
};

type MemoirSection = {
  id: string;
  title: string;
  content: string;
  order: number;
  parentId?: string;
  children?: MemoirSection[];
  focus?: string;
  period?: { from: string; to: string };
  lastUpdated?: string;
};

type MemoirOutline = {
  id: string;
  title: string;
  sections: MemoirSection[];
  lastUpdated: string;
  autoUpdate: boolean;
  metadata?: {
    languageStyle?: string;
    originalDocument?: boolean;
  };
};

type Chapter = {
  id: string;
  title: string;
  start_date: string;
  end_date?: string | null;
  description?: string | null;
  summary?: string | null;
};

// Reshape a generated/stored Biography into the MemoirOutline shape the reader uses.
// Single source of truth for that conversion — used on initial load and whenever a
// biography is generated or loaded from the saved list.
function biographyToOutline(biography: Biography): MemoirOutline {
  return {
    id: biography.id,
    title: biography.title,
    lastUpdated: biography.metadata.generatedAt,
    autoUpdate: false,
    sections: biography.chapters.map((chapter, idx) => ({
      id: chapter.id,
      title: chapter.title,
      content: chapter.text,
      order: idx + 1,
      period: {
        from: chapter.timeSpan.start,
        to: chapter.timeSpan.end
      }
    }))
  };
}

interface LoreBookProps {
  onOpenAppSidebar?: () => void;
}

export const LoreBook = ({ onOpenAppSidebar }: LoreBookProps = {}) => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const inLorebookShell = useLorebookShell();
  const shouldUseMock = useShouldUseMockData();
  const { compiledBooks, refresh: refreshCompiledBooks, isSimulated } = useLoreReadiness();
  const { preset, addGeneratedBook } = useLoreReadinessSimulation();
  const { chapters: loreChapters } = useLoreKeeper();
  const [outline, setOutline] = useState<MemoirOutline | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [fontSize, setFontSize] = useState<'sm' | 'base' | 'lg' | 'xl'>('lg');
  const [lineHeight, setLineHeight] = useState<'normal' | 'relaxed' | 'loose'>('relaxed');
  const [showChat, setShowChat] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatingQuery, setGeneratingQuery] = useState<string | null>(null);
  const [noStoryYet, setNoStoryYet] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [selectedBiography, setSelectedBiography] = useState<Biography | null>(null);
  const [showKnowledgeBaseCreator, setShowKnowledgeBaseCreator] = useState(false);
  const [downloading, setDownloading] = useState(false);
  
  // Page-based state
  const [allPages, setAllPages] = useState<BookPageType[]>([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [animationDirection, setAnimationDirection] = useState<'none' | 'next' | 'prev'>('none');
  const [isAnimating, setIsAnimating] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [viewportDimensions, setViewportDimensions] = useState(getViewportDimensions());
  const pageContainerRef = useRef<HTMLDivElement>(null);
  const urlBookHandledRef = useRef<string | null>(null);

  // New library / reading experience state
  const [showLibrary, setShowLibrary] = useState(true);
  const [isCoverVisible, setIsCoverVisible] = useState(false);
  const [theme, setTheme] = useState<ReadingTheme>('lore');
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const [activeBookMeta, setActiveBookMeta] = useState<{ scope?: string; period?: string } | null>(null);

  const cycleFontSize = () => {
    const order: Array<typeof fontSize> = ['sm', 'base', 'lg', 'xl'];
    setFontSize(order[(order.indexOf(fontSize) + 1) % order.length]);
  };
  const cycleTheme = () => {
    setTheme(t => t === 'lore' ? 'parchment' : t === 'parchment' ? 'daylight' : 'lore');
  };

  // Stable key so we don't re-run when useLoreKeeper returns a new array reference every render
  const loreChaptersKey = loreChapters.length > 0 ? loreChapters.map((c) => c.id).join(',') : '';

  // Load memoir outline and chapters
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        // Load from the biography system — the main lifestory is the
        // "always available" source of truth for a user's story (it
        // self-generates from existing memory if it doesn't exist yet).
        // The old /api/memoir/outline path is deprecated and returns an
        // empty outline for nearly every real user — do not use it.
        let loadedOutline: MemoirOutline | null = null;
        let storyUnavailable = false;
        try {
          const response = await fetchJson<{ biography: { biography_data: Biography } }>('/api/biography/main-lifestory');
          if (response.biography?.biography_data) {
            loadedOutline = biographyToOutline(response.biography.biography_data);
          }
        } catch (error) {
          // 404 means there isn't enough story to compile one yet —
          // not an error state, just "not enough material" (handled below).
          storyUnavailable = true;
          console.warn('No main lifestory available yet:', error);
        }

        // Logged-in users: real data, or the "not enough story yet" surface.
        // Unauthenticated only: allow the demo book fallback.
        if (!loadedOutline && shouldUseMock) {
          loadedOutline = DEFAULT_DEMO_LOREBOOK.outline;
          storyUnavailable = false;
        }

        setOutline(loadedOutline);
        setNoStoryYet(!loadedOutline && storyUnavailable);

        // Use chapters from useLoreKeeper or mock data (only when unauthenticated)
        if (loreChapters.length > 0) {
          setChapters(loreChapters.map(ch => ({
            id: ch.id,
            title: ch.title,
            start_date: ch.start_date,
            end_date: ch.end_date,
            description: ch.summary || '',
            summary: ch.summary || ''
          })));
        } else {
          setChapters(shouldUseMock ? DEFAULT_DEMO_LOREBOOK.loreChapters : []);
        }
      } catch (error) {
        console.error('Failed to load lore book data:', error);
        if (shouldUseMock) {
          setOutline(DEFAULT_DEMO_LOREBOOK.outline);
          setChapters(DEFAULT_DEMO_LOREBOOK.loreChapters);
        } else {
          setOutline(null);
          setChapters([]);
        }
      } finally {
        setLoading(false);
      }
    };

    void loadData();
  }, [shouldUseMock, loreChaptersKey]);

  // Auto-generate from a "focus" query param (e.g. ?focus=Career%20Rebuild%20Era),
  // the bridge from Living Biography chapters into a generated lorebook.
  const focusHandledRef = useRef(false);
  useEffect(() => {
    if (focusHandledRef.current) return;
    const focus = searchParams.get('focus');
    if (focus) {
      focusHandledRef.current = true;
      setShowLibrary(false);
      void handleGenerateFromQuery(focus);
    }
  }, [searchParams]);

  // Helper function to flatten sections
  const flattenSections = useCallback((sections: MemoirSection[]): MemoirSection[] => {
    const result: MemoirSection[] = [];
    const sorted = [...sections].sort((a, b) => a.order - b.order);

    for (const section of sorted) {
      result.push(section);
      if (section.children && section.children.length > 0) {
        result.push(...flattenSections(section.children));
      }
    }
    return result;
  }, []);

  const flatSections = useMemo(() => {
    return outline ? flattenSections(outline.sections || []) : [];
  }, [outline, flattenSections]);

  // Reset reading position when switching books
  useEffect(() => {
    setCurrentPageIndex(0);
    setCurrentSectionIndex(0);
    setIsAnimating(false);
    setAnimationDirection('none');
  }, [outline?.id]);

  // Handle viewport resize
  useEffect(() => {
    const handleResize = () => {
      setViewportDimensions(getViewportDimensions());
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Calculate pages when outline, sections, or settings change
  useEffect(() => {
    if (!outline || flatSections.length === 0) {
      setAllPages([]);
      setCurrentPageIndex(0);
      return;
    }

    let resizeObserver: ResizeObserver | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    // Wait for container to have a proper size
    const calculatePages = () => {
      const allCalculatedPages: BookPageType[] = [];

      flatSections.forEach((section, sectionIndex) => {
        if (!section.content) return;

        const containerEl = pageContainerRef.current;
        const isMobile = viewportDimensions.width < 768;
        const isTablet = viewportDimensions.width >= 768 && viewportDimensions.width < 1024;
        
        // Calculate available height - use more of the viewport
        // Account for: header (~64px), footer (~64px), search bar (~60px), and minimal padding
        const headerFooterHeight = 180; // Account for all UI elements
        const containerRect = containerEl?.getBoundingClientRect();
        const measuredHeight = containerRect?.height || 0;
        
        // Use measured height if available and reasonable (>100px), otherwise use viewport calculation
        // Maximize content area for better reading experience
        const fallbackHeight = Math.max(
          viewportDimensions.height - headerFooterHeight,
          Math.min(viewportDimensions.height * 0.85, 800) // Use 85% of viewport or max 800px for better readability
        );
        const availableHeight = measuredHeight > 100
          ? measuredHeight
          : fallbackHeight;
        
        // Calculate available width
        const availableWidth = containerEl && containerEl.getBoundingClientRect().width > 0
          ? containerEl.getBoundingClientRect().width
          : isMobile 
            ? viewportDimensions.width - 40 
            : isTablet 
            ? viewportDimensions.width - 300 
            : viewportDimensions.width - 400;

        const fontSizePx = fontSizeToPixels(fontSize);
        const lineHeightMult = lineHeightToMultiplier(lineHeight);

        const pages = calculatePagesForSection(section.content, sectionIndex, {
          fontSize: fontSizePx,
          lineHeight: lineHeightMult,
          containerHeight: availableHeight,
          containerWidth: availableWidth,
          marginTop: isMobile ? 10 : 12, // Further reduced margins for maximum content space
          marginBottom: isMobile ? 20 : 24, // Further reduced margins
          marginLeft: isMobile ? 12 : isTablet ? 20 : 40,
          marginRight: isMobile ? 12 : isTablet ? 20 : 40,
          padding: isMobile ? 8 : 10 // Further reduced padding for more content
        });

        allCalculatedPages.push(...pages);
      });

      setAllPages(allCalculatedPages);

      setCurrentPageIndex((prev) =>
        prev >= allCalculatedPages.length ? 0 : prev
      );
    };

    // Use ResizeObserver to wait for container to have proper dimensions
    const containerEl = pageContainerRef.current;
    if (!containerEl) {
      // Fallback: use setTimeout if container doesn't exist yet
      timeoutId = setTimeout(() => {
        calculatePages();
      }, 100);
      return;
    }

    // Try immediate calculation first
    const tryCalculate = () => {
      const rect = containerEl.getBoundingClientRect();
      
      // If container has height, calculate immediately
      if (rect.height > 100) {
        calculatePages();
        if (resizeObserver) {
          resizeObserver.disconnect();
          resizeObserver = null;
        }
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      }
    };

    // Try immediately
    tryCalculate();

    // Also set up ResizeObserver to catch when container gets size
    resizeObserver = new ResizeObserver(() => {
      tryCalculate();
    });
    resizeObserver.observe(containerEl);

    // Fallback timeout in case ResizeObserver doesn't fire
    timeoutId = setTimeout(() => {
      calculatePages();
      if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }
    }, 500);

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [outline, flatSections, fontSize, lineHeight, viewportDimensions]);

  const activeSectionIndex = allPages[currentPageIndex]?.sectionIndex ?? currentSectionIndex;

  const currentPage = useMemo(() => {
    return allPages.length > 0 && currentPageIndex < allPages.length ? allPages[currentPageIndex] : null;
  }, [allPages, currentPageIndex]);

  const currentSection = useMemo(() => {
    return currentPage 
      ? (flatSections[currentPage.sectionIndex] || flatSections[currentSectionIndex])
      : flatSections[currentSectionIndex];
  }, [currentPage, flatSections, currentSectionIndex]);

  const totalSections = flatSections.length;

  // Page navigation functions - MUST be before early returns
  const goToPreviousPage = useCallback(() => {
    if (isAnimating) return;
    
    if (currentPageIndex > 0) {
      setIsAnimating(true);
      setAnimationDirection('prev');
      const newIndex = currentPageIndex - 1;
      setCurrentPageIndex(newIndex);
      
      // Update section index if we moved to a different section
      const newPage = allPages[newIndex];
      if (newPage && newPage.sectionIndex !== currentSectionIndex) {
        setCurrentSectionIndex(newPage.sectionIndex);
      }
    }
  }, [currentPageIndex, allPages, currentSectionIndex, isAnimating]);

  const goToNextPage = useCallback(() => {
    if (isAnimating) return;
    
    if (currentPageIndex < allPages.length - 1) {
      setIsAnimating(true);
      setAnimationDirection('next');
      const newIndex = currentPageIndex + 1;
      setCurrentPageIndex(newIndex);
      
      // Update section index if we moved to a different section
      const newPage = allPages[newIndex];
      if (newPage && newPage.sectionIndex !== currentSectionIndex) {
        setCurrentSectionIndex(newPage.sectionIndex);
      }
    }
  }, [currentPageIndex, allPages, currentSectionIndex, isAnimating]);

  const goToLibrary = useCallback(() => {
    setShowLibrary(true);
    setIsCoverVisible(false);
    setActiveBookId(null);
    setActiveBookMeta(null);
    urlBookHandledRef.current = null;
    navigate('/lorebook', { replace: true });
  }, [navigate]);

  const isOnLastPage = allPages.length > 0 && currentPageIndex >= allPages.length - 1;

  const handleForwardNavigation = useCallback(() => {
    if (isAnimating) return;
    if (isOnLastPage) {
      goToLibrary();
      return;
    }
    goToNextPage();
  }, [isAnimating, isOnLastPage, goToLibrary, goToNextPage]);

  const goToPage = useCallback((index: number) => {
    if (isAnimating || index < 0 || index >= allPages.length) return;
    
    const direction = index > currentPageIndex ? 'next' : index < currentPageIndex ? 'prev' : 'none';
    setIsAnimating(true);
    setAnimationDirection(direction);
    setCurrentPageIndex(index);
    
    // Update section index
    const newPage = allPages[index];
    if (newPage && newPage.sectionIndex !== currentSectionIndex) {
      setCurrentSectionIndex(newPage.sectionIndex);
    }
  }, [currentPageIndex, allPages, currentSectionIndex, isAnimating]);

  const handleAnimationEnd = useCallback(() => {
    setIsAnimating(false);
    setAnimationDirection('none');
  }, []);

  // Fallback unlock: if animation end doesn't fire (reduced motion, dropped frame, etc.)
  // don't let pagination controls stay disabled.
  useEffect(() => {
    if (!isAnimating) return;
    const timeoutId = window.setTimeout(() => {
      setIsAnimating(false);
      setAnimationDirection('none');
    }, 350);
    return () => window.clearTimeout(timeoutId);
  }, [isAnimating]);

  // Legacy section navigation (for sidebar)
  const goToSection = useCallback((index: number) => {
    if (index < 0 || index >= flatSections.length) return;

    setIsAnimating(false);
    setAnimationDirection('none');
    setCurrentSectionIndex(index);

    const firstPageOfSection = allPages.findIndex(
      (page) => page.sectionIndex === index
    );

    if (firstPageOfSection >= 0) {
      setCurrentPageIndex(firstPageOfSection);
    }
  }, [allPages, flatSections.length]);

  // Swipe gesture handlers
  const swipeHandlers = useSwipeGesture({
    onSwipeLeft: handleForwardNavigation,
    onSwipeRight: goToPreviousPage,
    threshold: 50
  });

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if typing in input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (isAnimating) return;

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          goToPreviousPage();
          break;
        case 'ArrowRight':
          e.preventDefault();
          handleForwardNavigation();
          break;
        case 'Home':
          e.preventDefault();
          goToPage(0);
          break;
        case 'End':
          e.preventDefault();
          goToPage(allPages.length - 1);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToPreviousPage, handleForwardNavigation, goToPage, allPages.length, isAnimating]);

  // Calculate approximate page count for a section
  const calculatePageCount = (section: MemoirSection): number => {
    if (!section.content) return 0;
    
    // Average words per page in a book: ~250-300 words
    // Average characters per word: ~5 (including space)
    // So roughly 1250-1500 characters per page
    const charsPerPage = 1400; // Conservative estimate
    const contentLength = section.content.length;
    const pageCount = Math.ceil(contentLength / charsPerPage);
    
    // Minimum 1 page if there's any content
    return Math.max(1, pageCount);
  };

  const fontSizeClasses = {
    sm: 'text-sm',
    base: 'text-base',
    lg: 'text-lg',
    xl: 'text-xl'
  };

  const lineHeightClasses = {
    normal: 'leading-normal',
    relaxed: 'leading-relaxed',
    loose: 'leading-loose'
  };

  const handleLoadBiography = (biography: Biography) => {
    setOutline(biographyToOutline(biography));
    setCurrentSectionIndex(0);
    setSelectedBiography(biography);
    setActiveBookId(biography.id);
    setActiveBookMeta(null);
    setNoStoryYet(false);
    setGenerationError(null);
  };

  const openDemoBookForReading = useCallback((bookId: string) => {
    const book = resolveDemoLorebookById(bookId) ?? DEFAULT_DEMO_LOREBOOK;
    setOutline(book.outline);
    setChapters(book.loreChapters);
    setCurrentPageIndex(0);
    setCurrentSectionIndex(0);
    setIsAnimating(false);
    setAnimationDirection('none');
    setActiveBookId(bookId);
    setActiveBookMeta({ scope: book.scope, period: book.period });
    setSelectedBiography(null);
    setShowLibrary(false);
    setIsCoverVisible(true);
    setGenerationError(null);
    navigate(lorebookReadUrl(bookId), { replace: true });
  }, [navigate]);

  const openBiographyForReading = useCallback((biography: Biography) => {
    handleLoadBiography(biography);
    setCurrentPageIndex(0);
    setCurrentSectionIndex(0);
    setIsAnimating(false);
    setAnimationDirection('none');
    setShowLibrary(false);
    setIsCoverVisible(true);
    navigate(lorebookReadUrl(biography.id), { replace: true });
  }, [navigate]);

  const goToEditActiveBook = useCallback(() => {
    navigate(activeBookId ? lorebookEditUrl(activeBookId) : lorebookEditorUrlForCompiledBooks(compiledBooks));
  }, [activeBookId, compiledBooks, navigate]);

  const handleSaveAsCore = async (biographyId: string, name: string) => {
    try {
      await fetchJson(`/api/biography/${biographyId}/save-as-core`, {
        method: 'POST',
        body: JSON.stringify({ lorebookName: name })
      });
    } catch (error) {
      console.error('Failed to save biography as core lorebook:', error);
    }
  };

  const handleKnowledgeBaseGenerated = (biography: Biography) => {
    handleLoadBiography(biography);
    setShowKnowledgeBaseCreator(false);
  };

  const runDemoCompile = useCallback(async (
    input: { query?: string; topicId?: LoreTopicId },
    displayQuery: string | null,
  ) => {
    const startedAt = Date.now();
    setGenerating(true);
    setGeneratingQuery(displayQuery);
    setShowLibrary(false);
    setGenerationError(null);

    try {
      const result = compileDemoLorebook({ ...input, preset });
      if (!result.ok) {
        setGenerationError(result.message);
        return;
      }

      addGeneratedBook(result.compiled);
      await refreshCompiledBooks();
      openDemoBookForReading(result.bookId);
    } finally {
      await ensureMinGeneratingDuration(startedAt);
      setGenerating(false);
      setGeneratingQuery(null);
    }
  }, [addGeneratedBook, openDemoBookForReading, preset, refreshCompiledBooks]);

  const handleGenerateFromQuery = async (query: string, options?: { force?: boolean }) => {
    if (shouldUseMock || isSimulated) {
      await runDemoCompile({ query }, query);
      return;
    }

    const startedAt = Date.now();
    setGenerating(true);
    setGeneratingQuery(query);
    setShowLibrary(false);
    setGenerationError(null);
    try {
      let result = await compileLorebookFromQuery(query, options?.force ?? false);

      if (!result.ok && shouldConfirmForceCompile(result.conflict)) {
        const proceed = window.confirm(
          `${result.conflict.message}\n\nCompile a thinner book anyway?`
        );
        if (proceed) {
          result = await compileLorebookFromQuery(query, true);
        }
      }
      if (!result.ok) {
        setGenerationError(formatCompileBlockMessage(result.conflict));
        return;
      }

      if (result.data.biography) {
        const bio = result.data.biography as Biography;
        const bookId = result.data.biographyId || bio.id;
        if (!bookId || result.data.persisted === false) {
          setGenerationError('The book was drafted but not saved to your library. Try compiling again.');
          return;
        }
        handleLoadBiography({ ...bio, id: bookId });
        setIsCoverVisible(true);
        navigate(lorebookReadUrl(bookId), { replace: true });
      }
      if (result.warning) {
        setGenerationError(result.warning);
      }
    } catch (error) {
      console.error('Failed to generate biography:', error);
      const raw = error instanceof Error ? error.message : String(error);
      setGenerationError(
        raw.includes('No atoms found')
          ? "There isn't enough material yet for that specific book."
          : raw.includes('Failed to save')
            ? 'Compile finished but saving to your library failed. Try again.'
            : "That book couldn't be compiled right now."
      );
    } finally {
      await ensureMinGeneratingDuration(startedAt);
      setGenerating(false);
      setGeneratingQuery(null);
    }
  };

  const handleGenerateFromTopic = async (topicId: string, options?: CompileTopicOptions) => {
    if (shouldUseMock || isSimulated) {
      await runDemoCompile({ topicId: topicId as LoreTopicId }, null);
      return;
    }

    const startedAt = Date.now();
    setGenerating(true);
    setGeneratingQuery(topicId);
    setShowLibrary(false);
    setGenerationError(null);
    try {
      let result = await compileLorebookFromTopic(topicId, options);

      if (!result.ok && shouldConfirmForceCompile(result.conflict)) {
        const proceed = window.confirm(
          `${result.conflict.message}\n\nCompile a thinner book anyway?`
        );
        if (proceed) {
          result = await compileLorebookFromTopic(topicId, { ...options, force: true });
        }
      }
      if (!result.ok) {
        setGenerationError(formatCompileBlockMessage(result.conflict));
        return;
      }

      if (result.data.biography) {
        const bio = result.data.biography as Biography;
        const bookId = result.data.biographyId || bio.id;
        if (!bookId || result.data.persisted === false) {
          setGenerationError('The book was drafted but not saved to your library. Try compiling again.');
          return;
        }
        handleLoadBiography({ ...bio, id: bookId });
        setIsCoverVisible(true);
        navigate(lorebookReadUrl(bookId), { replace: true });
      }
      if (result.warning) {
        setGenerationError(result.warning);
      }
    } catch (error) {
      console.error('Failed to generate biography from topic:', error);
      const raw = error instanceof Error ? error.message : String(error);
      setGenerationError(
        raw.includes('No atoms found')
          ? "There isn't enough material yet for that specific book."
          : raw.includes('Failed to save')
            ? 'Compile finished but saving to your library failed. Try again.'
            : "That book couldn't be compiled right now."
      );
    } finally {
      await ensureMinGeneratingDuration(startedAt);
      setGenerating(false);
      setGeneratingQuery(null);
    }
  };

  const handleGenerateFromSpec = async (spec: any, _type?: string, options?: { force?: boolean }) => {
    if (shouldUseMock || isSimulated) {
      const query = spec?.title ?? spec?.lorebookName ?? spec?.themes ?? 'My LoreBook';
      await runDemoCompile({ query: String(query) }, String(query));
      return;
    }

    const startedAt = Date.now();
    setGenerating(true);
    setGeneratingQuery(spec?.title ?? spec?.lorebookName ?? spec?.themes ?? null);
    setShowLibrary(false);
    setGenerationError(null);
    try {
      let result = await compileLorebookFromSpec(spec, options?.force ?? false);

      if (!result.ok && shouldConfirmForceCompile(result.conflict)) {
        const proceed = window.confirm(
          `${result.conflict.message}\n\nCompile a thinner book anyway?`
        );
        if (proceed) {
          result = await compileLorebookFromSpec(spec, true);
        }
      }
      if (!result.ok) {
        setGenerationError(formatCompileBlockMessage(result.conflict));
        return;
      }

      if (result.data.biography) {
        const bio = result.data.biography as Biography;
        const bookId = result.data.biographyId || bio.id;
        if (!bookId || result.data.persisted === false) {
          setGenerationError('The book was drafted but not saved to your library. Try compiling again.');
          return;
        }
        handleLoadBiography({ ...bio, id: bookId });
        setIsCoverVisible(true);
        navigate(lorebookReadUrl(bookId), { replace: true });
      }
      if (result.warning) {
        setGenerationError(result.warning);
      }
    } catch (error) {
      console.error('Failed to generate biography from spec:', error);
      const raw = error instanceof Error ? error.message : String(error);
      setGenerationError(
        raw.includes('No atoms found')
          ? "There isn't enough material yet for that specific book."
          : raw.includes('Failed to save')
            ? 'Compile finished but saving to your library failed. Try again.'
            : "That book couldn't be compiled right now."
      );
    } finally {
      await ensureMinGeneratingDuration(startedAt);
      setGenerating(false);
      setGeneratingQuery(null);
    }
  };

  // Deep-link: open a specific book from ?book=
  useEffect(() => {
    const bookId = searchParams.get('book');
    if (!bookId || searchParams.get('focus')) return;
    if (urlBookHandledRef.current === bookId && !showLibrary) return;

    if (resolveDemoLorebookById(bookId) && (shouldUseMock || isSimulated)) {
      urlBookHandledRef.current = bookId;
      openDemoBookForReading(bookId);
      return;
    }

    if (!isDemoBookId(bookId)) {
      urlBookHandledRef.current = bookId;
      void (async () => {
        try {
          const result = await fetchJson<{ biography: Biography }>(`/api/biography/${bookId}`);
          if (result.biography) {
            openBiographyForReading(result.biography);
          }
        } catch (error) {
          console.warn('Failed to open book from URL:', error);
          setGenerationError("That book couldn't be found in your library.");
          setShowLibrary(false);
        }
      })();
    }
  }, [searchParams, shouldUseMock, isSimulated, showLibrary, openDemoBookForReading, openBiographyForReading]);

  // Bottom nav / shell: return to generate landing when route is bare /lorebook
  useEffect(() => {
    const path = location.pathname.split('?')[0];
    if (path !== '/lorebook' && path !== '/lorebook/') return;
    if (searchParams.get('book') || searchParams.get('focus')) return;
    setShowLibrary(true);
    setIsCoverVisible(false);
    setActiveBookId(null);
    setActiveBookMeta(null);
    urlBookHandledRef.current = null;
  }, [location.pathname, searchParams]);

  // Full-screen generating animation
  if (generating) {
    return <LoreBookGeneratingScreen query={generatingQuery} />;
  }

  // Library landing — shown on first load or when user returns to library
  if (showLibrary) {
    return (
      <LibraryLanding
        onGenerate={(query, options) => {
          void handleGenerateFromQuery(query, options);
        }}
        onGenerateTopic={(topicId, options) => {
          void handleGenerateFromTopic(topicId, options);
        }}
        onReadBook={(bookId) => {
          if (resolveDemoLorebookById(bookId) && (shouldUseMock || isSimulated)) {
            openDemoBookForReading(bookId);
          }
        }}
        onEditBook={(bookId) => {
          navigate(lorebookEditUrl(bookId));
        }}
        generating={generating}
        bottomSlot={
          (shouldUseMock || isSimulated) ? undefined : (
            <div className="space-y-8 mt-8">
              <div>
                <p className="text-xs text-white/35 uppercase tracking-widest font-mono mb-4">Suggested next lorebooks</p>
                <LorebookRecommendations onGenerate={handleGenerateFromSpec} />
              </div>
            </div>
          )
        }
      />
    );
  }

  if (!outline || flatSections.length === 0) {
    return (
      <LorebookEmptyState
        reason={generationError ? 'generation-failed' : 'no-story'}
        message={generationError}
        onGenerateFromSpec={handleGenerateFromSpec}
        onBackToLibrary={goToLibrary}
      />
    );
  }

  const handleDownload = async () => {
    if (downloading) return;
    
    setDownloading(true);
    try {
      const bookTitle = outline.title || 'My Lore Book';
      const date = new Date().toISOString().split('T')[0];
      
      // Dynamically import jsPDF to avoid React hook issues
      const { default: jsPDF } = await import('jspdf');
    
    // Create PDF document
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    // Set up fonts and styles
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const maxWidth = pageWidth - (margin * 2);
    let yPosition = margin;

    // Helper function to add a new page if needed
    const checkPageBreak = (requiredHeight: number) => {
      if (yPosition + requiredHeight > pageHeight - margin) {
        doc.addPage();
        yPosition = margin;
      }
    };

    // Add title
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    const titleLines = doc.splitTextToSize(bookTitle, maxWidth);
    doc.text(titleLines, margin, yPosition);
    yPosition += titleLines.length * 10 + 10;

    // Add date
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(128, 128, 128);
    doc.text(`Generated on ${new Date().toLocaleDateString()}`, margin, yPosition);
    yPosition += 10;

    // Add sections
    flatSections.forEach((section, idx) => {
      checkPageBreak(30);

      // Section title
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      const sectionTitleLines = doc.splitTextToSize(section.title, maxWidth);
      doc.text(sectionTitleLines, margin, yPosition);
      yPosition += sectionTitleLines.length * 8 + 5;

      // Section period (if available)
      if (section.period) {
        checkPageBreak(10);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(128, 128, 128);
        const periodText = `${new Date(section.period.from).toLocaleDateString()} - ${section.period.to ? new Date(section.period.to).toLocaleDateString() : 'Present'}`;
        doc.text(periodText, margin, yPosition);
        yPosition += 8;
      }

      // Section content
      if (section.content) {
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(0, 0, 0);
        
        // Split content into paragraphs and process
        const paragraphs = section.content.split('\n\n').filter(p => p.trim());
        
        paragraphs.forEach(paragraph => {
          checkPageBreak(15);
          
          // Clean up paragraph (remove markdown formatting, etc.)
          const cleanParagraph = paragraph
            .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold
            .replace(/\*(.*?)\*/g, '$1') // Remove italic
            .replace(/\[(.*?)\]\(.*?\)/g, '$1') // Remove links
            .trim();
          
          if (cleanParagraph) {
            const contentLines = doc.splitTextToSize(cleanParagraph, maxWidth);
            doc.text(contentLines, margin, yPosition);
            yPosition += contentLines.length * 6 + 4;
          }
        });
      }

      // Add separator between sections (except last)
      if (idx < flatSections.length - 1) {
        checkPageBreak(15);
        yPosition += 5;
        doc.setDrawColor(200, 200, 200);
        doc.line(margin, yPosition, pageWidth - margin, yPosition);
        yPosition += 10;
      }
    });

      // Save PDF
      const filename = `${bookTitle.toLowerCase().replace(/\s+/g, '-')}-${date}.pdf`;
      doc.save(filename);
    } catch (error) {
      console.error('Failed to generate PDF:', error);
    } finally {
      setDownloading(false);
    }
  };

  // Cover page — full-screen before the reader
  if (isCoverVisible && outline) {
    return (
      <div className={`${inLorebookShell ? 'h-full' : 'h-screen'} w-full theme-${theme}`} data-testid="lorebook-cover">
        <BookCoverPage
          title={outline.title || 'My Lore Book'}
          scope={activeBookMeta?.scope ?? outline.metadata?.languageStyle}
          period={activeBookMeta?.period}
          chapterCount={flatSections.length}
          theme={theme}
          onOpen={() => setIsCoverVisible(false)}
          onEdit={activeBookId ? goToEditActiveBook : undefined}
        />
      </div>
    );
  }

  return (
    <div className={`h-full w-full flex flex-col overflow-hidden theme-${theme}`} style={{ background: theme === 'daylight' ? '#f5f0e8' : '#111' }} data-testid="lorebook">

      {/* ── Mobile unified top bar (single bar on phones/tablets) ── */}
      <div
        className="lg:hidden flex items-center justify-between px-3 border-b flex-shrink-0"
        style={{
          paddingTop: 'max(env(safe-area-inset-top, 0px), 10px)',
          paddingBottom: '10px',
          background: theme === 'daylight' ? '#ece6d8' : theme === 'parchment' ? '#1a1208' : 'rgba(0,0,0,0.85)',
          borderColor: theme === 'daylight' ? 'rgba(100,80,40,0.15)' : theme === 'parchment' ? 'rgba(200,160,80,0.12)' : 'rgba(255,255,255,0.08)',
          backdropFilter: 'blur(12px)',
        }}
      >
        {/* Left: app menu + library back */}
        <div className="flex items-center gap-0.5">
          {onOpenAppSidebar && (
            <button type="button" onClick={onOpenAppSidebar} className="p-2.5 rounded-lg active:bg-white/10" aria-label="Open app menu">
              <Menu className={`h-5 w-5 ${theme === 'daylight' ? 'text-[#3a2e1a]/60' : 'text-white/50'}`} />
            </button>
          )}
          <button
            type="button"
            onClick={goToLibrary}
            className={`flex items-center gap-0.5 px-2 py-2 rounded-lg text-sm font-mono active:bg-white/10 ${theme === 'daylight' ? 'text-[#3a2e1a]/60' : 'text-white/50'}`}
          >
            <ChevronLeft className="h-4 w-4" />
            <span>Library</span>
          </button>
        </div>

        {/* Center: book title */}
        <span
          className={`text-sm font-semibold truncate max-w-[30%] ${theme === 'daylight' ? 'text-[#1a1208]' : theme === 'parchment' ? 'text-[#e8d5a0]' : 'text-white/90'}`}
          style={{ fontFamily: 'Georgia, serif' }}
        >
          {outline?.title || 'Lore Book'}
        </span>

        {/* Right: edit + font cycle + theme cycle + chapter list */}
        <div className="flex items-center gap-0.5">
          {activeBookId && (
            <button
              type="button"
              onClick={goToEditActiveBook}
              className={`p-2.5 rounded-lg active:bg-white/10 ${theme === 'daylight' ? 'text-[#3a2e1a]/60' : 'text-white/50'}`}
              aria-label="Edit this book"
            >
              <Edit3 className="h-5 w-5" />
            </button>
          )}
          <button
            type="button"
            onClick={cycleFontSize}
            className={`p-2.5 rounded-lg text-xs font-bold active:bg-white/10 ${theme === 'daylight' ? 'text-[#3a2e1a]/60' : 'text-white/50'}`}
            aria-label={`Font size: ${fontSize}`}
          >
            Aa
          </button>
          <button
            type="button"
            onClick={cycleTheme}
            className={`p-2.5 rounded-lg text-sm active:bg-white/10 ${theme === 'daylight' ? 'text-[#3a2e1a]/60' : 'text-white/50'}`}
            aria-label={`Theme: ${theme}`}
          >
            {theme === 'lore' ? '◑' : theme === 'parchment' ? '◕' : '○'}
          </button>
          <button
            type="button"
            onClick={() => setShowSidebar(!showSidebar)}
            className={`p-2.5 rounded-lg active:bg-white/10 ${theme === 'daylight' ? 'text-[#3a2e1a]/60' : 'text-white/50'}`}
            aria-label="Chapter list"
          >
            <BookMarked className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* ── Desktop unified top bar (one lean bar) ── */}
      <div className="hidden lg:flex border-b border-white/8 px-4 py-2 items-center justify-between flex-shrink-0 gap-3"
        style={{ background: theme === 'daylight' ? '#ece6d8' : theme === 'parchment' ? '#1a1208' : 'rgba(0,0,0,0.7)', borderColor: theme === 'daylight' ? 'rgba(100,80,40,0.15)' : 'rgba(255,255,255,0.07)' }}>
        {/* Left: back + title + page count */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button type="button" onClick={goToLibrary}
            className={`flex items-center gap-1 text-xs font-mono shrink-0 transition-colors ${theme === 'daylight' ? 'text-[#6b5a3a] hover:text-[#1a1208]' : 'text-white/40 hover:text-white'}`}>
            <ChevronLeft className="h-3.5 w-3.5" />
            Library
          </button>
          <div className={`w-px h-3.5 shrink-0 ${theme === 'daylight' ? 'bg-[#6b5a3a]/20' : 'bg-white/10'}`} />
          <div className="flex items-center gap-2 min-w-0">
            <BookMarked className="h-4 w-4 text-primary shrink-0" />
            <h1 className={`text-sm font-semibold truncate ${theme === 'daylight' ? 'text-[#1a1208]' : theme === 'parchment' ? 'text-[#e8d5a0]' : 'text-white/90'}`}
              style={{ fontFamily: 'Georgia, serif' }}>{outline.title || 'My Lorebook'}</h1>
            {allPages.length > 0 && (
              <span className={`text-xs font-mono shrink-0 ${theme === 'daylight' ? 'text-[#6b5a3a]/60' : 'text-white/30'}`}>
                {currentPageIndex + 1}/{allPages.length}
              </span>
            )}
          </div>
        </div>

        {/* Right: actions + typography + theme */}
        <div className="flex items-center gap-1.5 shrink-0">
          {activeBookId && (
            <button type="button" onClick={goToEditActiveBook}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${theme === 'daylight' ? 'text-[#6b5a3a]/60 hover:text-[#1a1208]' : 'text-white/35 hover:text-white'}`}
              title="Edit this book">
              <Edit3 className="h-4 w-4" />
              <span className="hidden xl:inline">Edit</span>
            </button>
          )}
          {/* Chat toggle */}
          <button type="button" onClick={() => setShowChat(c => !c)}
            className={`p-1.5 rounded transition-colors ${showChat ? 'text-primary' : theme === 'daylight' ? 'text-[#6b5a3a]/60 hover:text-[#1a1208]' : 'text-white/35 hover:text-white'}`}
            title="Ask Lorebook">
            <MessageSquare className="h-4 w-4" />
          </button>
          {/* Download */}
          <button type="button" onClick={handleDownload} disabled={downloading}
            className={`p-1.5 rounded transition-colors disabled:opacity-30 ${theme === 'daylight' ? 'text-[#6b5a3a]/60 hover:text-[#1a1208]' : 'text-white/35 hover:text-white'}`}
            title="Download PDF">
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          </button>
          {/* Stats */}
          <button type="button" onClick={() => setShowStats(s => !s)}
            className={`px-2 py-1 rounded text-xs transition-colors ${showStats ? 'text-primary bg-primary/10' : theme === 'daylight' ? 'text-[#6b5a3a]/60 hover:text-[#1a1208]' : 'text-white/35 hover:text-white'}`}>
            Stats
          </button>

          <div className={`w-px h-3.5 ${theme === 'daylight' ? 'bg-[#6b5a3a]/20' : 'bg-white/10'}`} />

          {/* Font size */}
          <div className={`flex items-center gap-1 rounded px-1.5 py-1 ${theme === 'daylight' ? 'bg-[#6b5a3a]/8' : 'bg-white/5'}`}>
            <Type className={`h-3 w-3 ${theme === 'daylight' ? 'text-[#6b5a3a]/50' : 'text-white/40'}`} />
            <select value={fontSize} onChange={(e) => setFontSize(e.target.value as typeof fontSize)}
              title="Font size"
              aria-label="Font size"
              className={`bg-transparent border-none text-xs focus:outline-none cursor-pointer ${theme === 'daylight' ? 'text-[#1a1208]' : 'text-white'}`}>
              <option value="sm" className="bg-black">S</option>
              <option value="base" className="bg-black">M</option>
              <option value="lg" className="bg-black">L</option>
              <option value="xl" className="bg-black">XL</option>
            </select>
          </div>
          {/* Line height */}
          <div className={`flex items-center gap-1 rounded px-1.5 py-1 ${theme === 'daylight' ? 'bg-[#6b5a3a]/8' : 'bg-white/5'}`}>
            <AlignJustify className={`h-3 w-3 ${theme === 'daylight' ? 'text-[#6b5a3a]/50' : 'text-white/40'}`} />
            <select value={lineHeight} onChange={(e) => setLineHeight(e.target.value as typeof lineHeight)}
              title="Line spacing"
              aria-label="Line spacing"
              className={`bg-transparent border-none text-xs focus:outline-none cursor-pointer ${theme === 'daylight' ? 'text-[#1a1208]' : 'text-white'}`}>
              <option value="normal" className="bg-black">Tight</option>
              <option value="relaxed" className="bg-black">Normal</option>
              <option value="loose" className="bg-black">Wide</option>
            </select>
          </div>

          <div className={`w-px h-3.5 ${theme === 'daylight' ? 'bg-[#6b5a3a]/20' : 'bg-white/10'}`} />

          {/* Theme switcher */}
          {(['lore', 'parchment', 'daylight'] as ReadingTheme[]).map((t) => (
            <button type="button" key={t} onClick={() => setTheme(t)}
              className={`px-2 py-1 rounded text-xs font-mono transition-all ${theme === t ? 'bg-white/15 text-white' : 'text-white/30 hover:text-white/70'}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Panel */}
      {showStats && (
        <div className="border-b border-white/10 bg-black/30 backdrop-blur-sm px-4 py-4 sm:px-8">
          <LorebookStats />
        </div>
      )}

      {/* Main Content Area with Sidebar - Kindle Style */}
      <div className="flex-1 flex overflow-hidden relative bg-[#1a1a1a] min-h-0" style={{ height: '100%', minHeight: 0 }}>
        {/* Left Sidebar - Chapter Navigation (Desktop) */}
        <div className={`${
          showSidebar ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0 fixed lg:static inset-y-0 left-0 z-50 w-64 flex-shrink-0 border-r border-white/10 bg-[#1a1a1a] overflow-y-auto transition-transform duration-300 ease-in-out`}>
          <div className="p-4">
            <div className="flex items-center justify-between mb-3 lg:hidden">
              <h3 className="text-sm font-semibold text-white/80 uppercase tracking-wider">Chapters</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSidebar(false)}
                className="text-white/70 hover:text-white"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <h3 className="hidden lg:block text-sm font-semibold text-white/80 mb-3 uppercase tracking-wider">Chapters</h3>
            <nav className="space-y-1">
              {flatSections.map((section, index) => {
                const sectionPages = allPages.filter(p => p.sectionIndex === index);
                const pageCount = sectionPages.length || calculatePageCount(section);
                return (
                  <button
                    key={section.id || index}
                    onClick={() => {
                      goToSection(index);
                      setShowSidebar(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg transition-all ${
                      index === activeSectionIndex
                        ? 'bg-primary/20 text-primary border border-primary/30'
                        : 'text-white/60 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-xs text-white/40 mt-0.5 font-mono">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {section.title}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {section.period && (
                            <div className="text-xs text-white/40">
                              {new Date(section.period.from).getFullYear()}
                              {section.period.to && ` - ${new Date(section.period.to).getFullYear()}`}
                            </div>
                          )}
                          <span className="text-xs text-white/30">•</span>
                          <div className="text-xs text-white/40">
                            {pageCount} {pageCount === 1 ? 'page' : 'pages'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Sidebar Overlay (Mobile) */}
        {showSidebar && (
          <div
            className="lg:hidden fixed inset-0 bg-black/50 z-40"
            onClick={() => setShowSidebar(false)}
          />
        )}

        {/* Book Content - Kindle Style Reading Area */}
        <div 
          ref={pageContainerRef}
          className="flex-1 overflow-hidden relative min-h-0"
          style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}
          {...swipeHandlers}
        >
          {/* Touch Zones for Mobile Navigation */}
          <div className="absolute inset-0 flex z-10 pointer-events-none" role="navigation" aria-label="Page navigation">
            <button
              type="button"
              className="w-[30%] h-full cursor-pointer pointer-events-auto focus:outline-none focus:ring-2 focus:ring-primary/50"
              onClick={goToPreviousPage}
              disabled={currentPageIndex === 0 || isAnimating}
              aria-label="Previous page"
              tabIndex={0}
            />
            <div className="flex-1" />
            <button
              type="button"
              className="w-[30%] h-full cursor-pointer pointer-events-auto focus:outline-none focus:ring-2 focus:ring-primary/50"
              onClick={handleForwardNavigation}
              disabled={isAnimating || allPages.length === 0}
              aria-label={isOnLastPage ? 'Back to LoreBook Library' : 'Next page'}
              tabIndex={0}
            />
          </div>

          {/* Page Container with Slide Animation */}
          <div 
            className="absolute inset-0 flex items-center justify-center"
            role="main"
            aria-label="Book content"
            aria-live="polite"
            aria-atomic="true"
          >
            {allPages.length > 0 && currentPageIndex < allPages.length ? (
              <div className="w-full h-full flex items-stretch justify-center p-2 sm:p-4 lg:p-6" style={{ minHeight: '100%', height: '100%' }}>
                <BookPage
                  content={allPages[currentPageIndex].content}
                  pageNumber={allPages[currentPageIndex].pageNumber}
                  totalPages={allPages[currentPageIndex].totalPagesInSection}
                  sectionTitle={flatSections[allPages[currentPageIndex].sectionIndex]?.title}
                  bookTitle={outline.title || 'My Lore Book'}
                  sectionPeriod={flatSections[allPages[currentPageIndex].sectionIndex]?.period}
                  fontSize={fontSize}
                  lineHeight={lineHeight}
                  animationDirection={animationDirection}
                  onAnimationEnd={handleAnimationEnd}
                  className="w-full h-full max-w-[100%] sm:max-w-[95%] md:max-w-[90%] lg:max-w-5xl xl:max-w-6xl"
                />
              </div>
            ) : (
              <div className="text-center text-white/60 p-8" role="status" aria-live="polite">
                <BookOpen className="h-16 w-16 mx-auto mb-4 text-white/40" aria-hidden="true" />
                <p>No pages available</p>
            </div>
          )}
          </div>
        </div>
      </div>

      {/* Navigation Footer */}
      <div
        className="border-t flex items-center justify-between flex-shrink-0 px-3 sm:px-8"
        style={{
          paddingTop: '10px',
          paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 10px)',
          background: theme === 'daylight' ? '#ece6d8' : theme === 'parchment' ? '#1a1208' : '#111',
          borderColor: theme === 'daylight' ? 'rgba(100,80,40,0.15)' : theme === 'parchment' ? 'rgba(200,160,80,0.12)' : 'rgba(255,255,255,0.08)',
        }}
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={goToPreviousPage}
          disabled={currentPageIndex === 0 || isAnimating}
          className={`disabled:opacity-30 min-w-[44px] min-h-[44px] ${theme === 'daylight' ? 'text-[#3a2e1a]/60 hover:text-[#1a1208]' : 'text-white/70 hover:text-white'}`}
          leftIcon={<ChevronLeft className="h-5 w-5" />}
          aria-label="Previous page"
        >
          <span className="hidden sm:inline">Previous</span>
        </Button>

        {/* Page Progress Indicator */}
        <div className="flex flex-col items-center gap-1 flex-1 max-w-[60%]">
          <div className={`text-xs sm:text-sm ${theme === 'daylight' ? 'text-[#6b5a3a]' : 'text-white/60'}`}>
            Page {currentPageIndex + 1} of {allPages.length}
            {allPages.length > 0 && (
              <span className={`ml-2 ${theme === 'daylight' ? 'text-[#6b5a3a]/60' : 'text-white/40'}`}>
                ({Math.round(((currentPageIndex + 1) / allPages.length) * 100)}%)
              </span>
            )}
          </div>
          {/* Progress Bar */}
          {allPages.length > 0 && (
            <div className={`w-full max-w-xs h-1 rounded-full overflow-hidden ${theme === 'daylight' ? 'bg-[#6b5a3a]/15' : 'bg-white/10'}`}>
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${((currentPageIndex + 1) / allPages.length) * 100}%` }}
              />
            </div>
          )}
          {/* Section Dots (Mobile) */}
          <div className={`flex items-center gap-1.5 sm:hidden px-3 py-1.5 rounded-full border overflow-x-auto max-w-full ${theme === 'daylight' ? 'bg-[#6b5a3a]/8 border-[#6b5a3a]/15' : 'bg-black/60 border-white/10'}`}>
            {flatSections.map((section, index) => {
              const isCurrentSection = allPages[currentPageIndex]?.sectionIndex === index;
              
              return (
            <button
              key={index}
              onClick={() => goToSection(index)}
              className={`rounded-full transition-all flex-shrink-0 ${
                    isCurrentSection
                      ? 'bg-primary w-6 h-2'
                      : 'bg-white/20 hover:bg-white/40 w-2 h-2'
                  }`}
                  title={section?.title}
                  aria-label={`Go to section: ${section?.title}`}
                />
              );
            })}
          </div>
          {/* Section Dots (Desktop) */}
          <div className="hidden sm:flex items-center gap-1 px-4 py-2 bg-black/60 rounded-full border border-white/10 overflow-x-auto max-w-full">
            {flatSections.map((section, index) => {
              const isCurrentSection = allPages[currentPageIndex]?.sectionIndex === index;
              
              return (
                <button
                  key={index}
                  onClick={() => goToSection(index)}
                  className={`rounded-full transition-all flex-shrink-0 ${
                    isCurrentSection
                  ? 'bg-primary w-8 h-2'
                  : 'bg-white/20 hover:bg-white/40 w-2 h-2'
              }`}
              title={section?.title}
              aria-label={`Go to section: ${section?.title}`}
            />
              );
            })}
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleForwardNavigation}
          disabled={isAnimating || allPages.length === 0}
          className={`min-w-[44px] min-h-[44px] ${
            isOnLastPage
              ? theme === 'daylight'
                ? 'text-primary hover:text-primary/80 hover:bg-primary/10'
                : 'text-primary hover:text-primary/80 hover:bg-primary/10'
              : theme === 'daylight'
                ? 'text-[#3a2e1a]/60 hover:text-[#1a1208]'
                : 'text-white/70 hover:text-white'
          } disabled:opacity-30`}
          rightIcon={
            isOnLastPage ? (
              <BookMarked className="h-5 w-5" />
            ) : (
              <ChevronRight className="h-5 w-5" />
            )
          }
          aria-label={isOnLastPage ? 'Back to LoreBook Library' : 'Next page'}
        >
          <span className="hidden sm:inline">{isOnLastPage ? 'Library' : 'Next'}</span>
          <span className="sm:hidden">{isOnLastPage ? 'Library' : ''}</span>
        </Button>
      </div>

      {/* Download Section — desktop only */}
      <div className="hidden lg:flex border-t border-border/60 bg-black/50 backdrop-blur-sm px-8 py-4 items-center justify-center flex-shrink-0">
        <Button
          onClick={handleDownload}
          disabled={downloading}
          variant="outline"
          className="bg-primary/20 hover:bg-primary/30 text-primary border-primary/30"
          leftIcon={downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        >
          {downloading ? 'Generating PDF...' : 'Download as PDF'}
        </Button>
      </div>

      {/* Chat Panel — toggled from top bar icon */}
      {showChat && (
        <div className="border-t border-border/40 h-[520px] max-h-[55vh] flex flex-col overflow-hidden bg-black/40 flex-shrink-0">
          <div className="flex items-center justify-between px-4 py-2 border-b border-white/8 flex-shrink-0">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-white/80">Ask Lorebook</span>
            </div>
            <button type="button" onClick={() => setShowChat(false)}
              className="p-1.5 rounded text-white/40 hover:text-white transition-colors" aria-label="Close chat">
              <X className="h-4 w-4" />
            </button>
          </div>
          <ChatFirstInterface />
        </div>
      )}


      {/* Knowledge Base Creator Modal */}
      {showKnowledgeBaseCreator && (
        <KnowledgeBaseCreator
          onGenerated={handleKnowledgeBaseGenerated}
          onClose={() => setShowKnowledgeBaseCreator(false)}
        />
      )}
    </div>
  );
};

