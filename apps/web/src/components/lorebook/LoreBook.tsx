import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, BookMarked, MessageSquare, ChevronUp, ChevronDown, Type, AlignJustify, Search, Sparkles, Loader2, Download, Menu, X } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { ColorCodedTimeline } from '../timeline/ColorCodedTimeline';
import { ChatFirstInterface } from '../../features/chat/components/ChatFirstInterface';
import { BiographyGenerator } from '../biography/BiographyGenerator';
import { BiographyRecommendations } from './BiographyRecommendations';
import { SavedBiographies } from './SavedBiographies';
import { CoreLorebooks } from './CoreLorebooks';
import { KnowledgeBaseCreator } from './KnowledgeBaseCreator';
import { LorebookRecommendations } from './LorebookRecommendations';
import { QuerySuggestions } from './QuerySuggestions';
import { fetchJson } from '../../lib/api';
import { useMockData } from '../../contexts/MockDataContext';
import { useLoreKeeper } from '../../hooks/useLoreKeeper';
import { BookPage } from './BookPage';
import { useSwipeGesture } from '../../hooks/useSwipeGesture';
import { calculatePagesForSection, fontSizeToPixels, lineHeightToMultiplier, getViewportDimensions, type BookPage as BookPageType } from '../../utils/pageCalculator';
import { LorebookStats } from './LorebookStats';

// Biography types (define locally to avoid server import)
type Biography = {
  id: string;
  user_id: string;
  lorebook_name: string;
  spec: any;
  outline: any;
  sections: any[];
  created_at: string;
  updated_at: string;
};

type BiographySpec = {
  scope: string;
  depth: string;
  tone?: string;
  audience?: string;
  version?: string;
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


// Dummy book data for demonstration
const dummyBook: MemoirOutline = {
  id: 'dummy-book-1',
  title: 'The Chronicles of Aetheria',
  lastUpdated: new Date().toISOString(),
  autoUpdate: false,
  sections: [
    {
      id: 'section-1',
      title: 'The Awakening',
      content: `The first light of dawn crept over the horizon, painting the sky in hues of orange and violet. Elara stood at the edge of the ancient forest, her hand resting on the gnarled bark of the World Tree. The air hummed with an energy she had never felt before—a resonance that seemed to call to something deep within her soul.

She had been drawn here by dreams, visions that had plagued her sleep for weeks. In them, she saw a realm beyond the veil, a place where magic flowed like water and time moved in strange currents. The elders had warned her against seeking answers in the old places, but Elara had always been one to follow her instincts.

As her fingers traced the intricate patterns carved into the tree's surface, she felt a warmth spread through her palm. The symbols began to glow, faintly at first, then brighter, until the entire clearing was bathed in an ethereal light. The ground beneath her feet trembled, and she heard a voice—ancient, wise, and filled with sorrow.

"Child of the lost bloodline," it whispered, "you have come at last. The balance has shifted, and the old magic stirs once more. You must choose: embrace the power that flows in your veins, or turn away and let darkness consume all that remains."

Elara's heart raced. This was it—the moment that would define everything. She took a deep breath and pressed her hand fully against the tree. "I choose to embrace it," she said, her voice steady despite the fear that clawed at her chest.

The light exploded outward, and Elara felt herself being pulled into something vast and infinite. When her vision cleared, she was no longer in the forest. She stood in a realm of swirling colors and impossible geometries, where the very fabric of reality seemed to bend and fold around her.

This was the beginning of everything.`,
      order: 1,
      period: { from: '2024-01-01', to: '2024-01-15' },
      focus: 'Character introduction and world-building'
    },
    {
      id: 'section-2',
      title: 'The Academy of Shadows',
      content: `The Academy of Shadows was not a place one found—it found you. Elara had been wandering the strange realm for what felt like days when the structure materialized before her. It was a building that defied logic: walls that curved inward, staircases that led to nowhere, and windows that showed different times of day depending on which angle you viewed them from.

A figure emerged from the shadows—tall, cloaked, with eyes that seemed to see through everything. "Welcome, Initiate," the figure said, their voice echoing strangely. "I am Master Thorne. You have been expected."

Elara followed Master Thorne through corridors that shifted and changed as they walked. Doors appeared where none had been before, and she caught glimpses of other students practicing spells that made the air shimmer. In one room, a young man was attempting to weave light into solid form. In another, a girl was learning to read the threads of fate itself.

"You will learn many things here," Master Thorne explained as they walked. "But the most important lesson is this: magic is not a tool to be wielded. It is a relationship. You must understand it, respect it, and above all, you must never try to control it completely. The moment you do, it will turn on you."

They stopped before a massive door covered in runes that seemed to writhe and shift. "This is the Library of Infinite Knowledge," Master Thorne said. "Within these walls, you will find answers to questions you haven't even thought to ask yet. But beware—knowledge comes with a price. The deeper you go, the more it will change you."

Elara pushed open the door and stepped inside. The library stretched into infinity, shelves upon shelves of books that seemed to rearrange themselves when she wasn't looking. She reached for a volume bound in what looked like dragon scales, and as her fingers touched it, she felt a jolt of understanding flood through her mind.

She was home.`,
      order: 2,
      period: { from: '2024-01-16', to: '2024-02-28' },
      focus: 'World expansion and magical system introduction'
    },
    {
      id: 'section-3',
      title: 'The First Trial',
      content: `The Trial of Elements came without warning. One moment, Elara was studying ancient texts in the library. The next, she found herself standing in a circular chamber with four archways, each leading to a different realm of elemental power.

Fire. Water. Earth. Air.

She had to master each one, or fail and be cast out of the Academy forever. The pressure was immense, but Elara had never been one to back down from a challenge.

She chose Fire first, stepping through the archway into a realm of endless flame. The heat was intense, but she focused on the energy within herself, finding the spark that resonated with the fire around her. Slowly, she learned to dance with the flames rather than fight them, to become one with the element rather than dominate it.

Water came next—a realm of endless ocean where she had to learn to breathe beneath the waves and command the currents. Earth taught her patience and strength, showing her how to feel the heartbeat of the world itself. Air was the most difficult, requiring her to let go of all control and trust in the wind to carry her.

When she emerged from the final archway, Master Thorne was waiting. "You have passed," they said, a rare smile touching their lips. "But remember, this was only the beginning. The real trials lie ahead, and they will test not just your power, but your heart."

Elara nodded, feeling changed in ways she couldn't yet understand. She had touched the elements, and they had touched her in return. Something fundamental had shifted within her, and she knew that nothing would ever be the same.`,
      order: 3,
      period: { from: '2024-03-01', to: '2024-03-20' },
      focus: 'Character growth and magical mastery'
    },
    {
      id: 'section-4',
      title: 'The Shadow Council',
      content: `Not all who studied at the Academy were allies. Elara learned this the hard way when she discovered the existence of the Shadow Council—a secret organization of mages who believed that magic should be hoarded and controlled, not shared freely with the world.

The Council had been watching her since her arrival, drawn by the power they sensed within her. They approached her one evening as she walked through the gardens, their leader—a mage named Valdris—stepping out from behind a statue.

"You have potential," Valdris said, his voice smooth as silk and twice as dangerous. "But you waste it on these... common teachings. Join us, and we will show you what true power looks like. We will teach you to bend reality itself to your will."

Elara felt the pull of his words, the temptation to take the easy path to power. But something in his eyes made her hesitate. There was a hunger there, a darkness that spoke of corruption and loss of self.

"I'm not interested," she said, turning to leave.

Valdris's hand shot out, grabbing her arm. "You will be," he hissed. "One way or another, you will be. The old ways are dying, Elara. Those who cling to them will die with them. Choose wisely."

As he disappeared into the shadows, Elara felt a chill run down her spine. The Academy was not the safe haven she had thought it was. There were forces at play here, forces that wanted to use her for their own ends.

She would need to be careful. And she would need to be strong.`,
      order: 4,
      period: { from: '2024-03-21', to: '2024-04-10' },
      focus: 'Introduction of conflict and antagonists'
    },
    {
      id: 'section-5',
      title: 'The Prophecy Revealed',
      content: `The truth came to her in a dream, or perhaps it was a vision—the distinction had become blurred. She stood in a place that was neither here nor there, before a figure that was both ancient and ageless.

"You are the Last Keeper," the figure said, their voice resonating with the weight of eons. "The one who will either restore the balance or watch as everything falls into darkness. The choice has always been yours, but now you must make it with full knowledge of what it means."

Images flooded her mind: a world where magic had been stripped away, leaving only emptiness and despair. A world where the Shadow Council ruled with an iron fist, using their power to subjugate all who opposed them. And then, another vision—a world where magic flowed freely, where the barriers between realms had been healed, where balance had been restored.

"The path will not be easy," the figure continued. "You will face trials that will break you, choices that will tear you apart. You will lose friends, make enemies, and question everything you believe in. But if you stay true to yourself, if you remember why you chose this path in the first place, you can succeed."

When Elara awoke, she found a book on her nightstand that hadn't been there before. It was bound in silver and gold, and when she opened it, the pages were blank—until she touched them. Then, words began to appear, written in a language she somehow understood.

It was the Prophecy of the Last Keeper. And it was about her.

She read through the night, learning of the ancient conflict that had torn the realms apart, of the Keepers who had maintained the balance for millennia, and of the dark force that had destroyed them all—except for one. Her.

The weight of destiny settled on her shoulders, heavy but not crushing. She had been chosen, yes, but she would make her own choices. She would write her own story, prophecy be damned.`,
      order: 5,
      period: { from: '2024-04-11', to: '2024-05-01' },
      focus: 'Revelation of destiny and greater purpose'
    }
  ]
};

const dummyChapters: Chapter[] = [
  {
    id: 'chapter-1',
    title: 'The Beginning',
    start_date: '2024-01-01',
    end_date: '2024-01-31',
    description: 'Elara discovers her magical heritage',
    summary: 'The awakening of power and the journey to the Academy begins.'
  },
  {
    id: 'chapter-2',
    title: 'Learning and Growth',
    start_date: '2024-02-01',
    end_date: '2024-03-31',
    description: 'Training at the Academy and mastering the elements',
    summary: 'Elara undergoes rigorous training and faces her first major trial.'
  },
  {
    id: 'chapter-3',
    title: 'Shadows and Light',
    start_date: '2024-04-01',
    end_date: '2024-05-31',
    description: 'The Shadow Council emerges and the prophecy is revealed',
    summary: 'Dark forces gather as Elara learns the truth about her destiny.'
  }
];

export const LoreBook = () => {
  const { useMockData: isMockDataEnabled } = useMockData();
  const { chapters: loreChapters } = useLoreKeeper();
  const [outline, setOutline] = useState<MemoirOutline | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [fontSize, setFontSize] = useState<'sm' | 'base' | 'lg' | 'xl'>('xl');
  const [lineHeight, setLineHeight] = useState<'normal' | 'relaxed' | 'loose'>('relaxed');
  const [showChat, setShowChat] = useState(false); // Hidden by default for reading focus
  const [searchQuery, setSearchQuery] = useState('');
  const [generating, setGenerating] = useState(false);
  const [selectedBiography, setSelectedBiography] = useState<Biography | null>(null);
  const [showGenerator, setShowGenerator] = useState(false);
  const [showRecommendations, setShowRecommendations] = useState(true);
  const [showSaved, setShowSaved] = useState(false);
  const [showCoreLorebooks, setShowCoreLorebooks] = useState(false);
  const [showKnowledgeBaseCreator, setShowKnowledgeBaseCreator] = useState(false);
  const [availableBiographies, setAvailableBiographies] = useState<Biography[]>([]);
  const [downloading, setDownloading] = useState(false);
  const [showQuerySuggestions, setShowQuerySuggestions] = useState(false);
  const [characters, setCharacters] = useState<Array<{ id: string; name: string }>>([]);
  const [locations, setLocations] = useState<Array<{ id: string; name: string }>>([]);
  const [skills, setSkills] = useState<Array<{ id: string; name: string }>>([]);
  
  // Page-based state
  const [allPages, setAllPages] = useState<BookPageType[]>([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [animationDirection, setAnimationDirection] = useState<'none' | 'next' | 'prev'>('none');
  const [isAnimating, setIsAnimating] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showStats, setShowStats] = useState(false); // Mobile sidebar state
  const [viewportDimensions, setViewportDimensions] = useState(getViewportDimensions());
  const pageContainerRef = useRef<HTMLDivElement>(null);

  // Load entities for query suggestions
  useEffect(() => {
    const loadEntities = async () => {
      try {
        // Load characters
        const charData = await fetchJson<{ characters: Array<{ id: string; name: string }> }>('/api/characters/list');
        setCharacters(charData.characters || []);

        // Load locations
        const locData = await fetchJson<{ locations: Array<{ id: string; name: string }> }>('/api/locations');
        setLocations(locData.locations || []);

        // Load skills
        const skillData = await fetchJson<{ skills: Array<{ id: string; name: string; skill_name: string }> }>('/api/skills');
        setSkills((skillData.skills || []).map(s => ({ id: s.id, name: s.skill_name || s.name })));
      } catch (error) {
        console.warn('Failed to load entities for suggestions:', error);
      }
    };
    loadEntities();
  }, []);

  // Load memoir outline and chapters
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        // Try to load real memoir outline
        let loadedOutline: MemoirOutline | null = null;
        try {
          const response = await fetchJson<{ outline: MemoirOutline }>('/api/memoir/outline');
          loadedOutline = response.outline;
        } catch (error) {
          console.warn('Failed to load memoir outline:', error);
        }

        // Use mock data if no real data is available (always show something)
        if (!loadedOutline) {
          loadedOutline = dummyBook;
        }

        setOutline(loadedOutline);

        // Use chapters from useLoreKeeper or mock data
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
          // Always show mock chapters if no real data
          setChapters(dummyChapters);
        }
      } catch (error) {
        console.error('Failed to load lore book data:', error);
        // Always fallback to mock data
          setOutline(dummyBook);
          setChapters(dummyChapters);
      } finally {
        setLoading(false);
      }
    };

    void loadData();
  }, [isMockDataEnabled, loreChapters]);

  // Load lorebook recommendations (must be before early returns)
  useEffect(() => {
    const loadRecommendations = async () => {
      try {
        const result = await fetchJson<{ recommendations: any[] }>('/api/biography/lorebook-recommendations?limit=10');
        // Store recommendations for display
        // You can add a state variable to show these
      } catch (error) {
        console.warn('Failed to load lorebook recommendations:', error);
      }
    };
    loadRecommendations();
  }, []);

  // Helper function to flatten sections
  const flattenSections = (sections: MemoirSection[]): MemoirSection[] => {
    const result: MemoirSection[] = [];
    const sorted = [...sections].sort((a, b) => a.order - b.order);
    
    for (const section of sorted) {
      result.push(section);
      if (section.children && section.children.length > 0) {
        result.push(...flattenSections(section.children));
      }
    }
    return result;
  };

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
    if (!outline || !outline.sections || outline.sections.length === 0) {
      setAllPages([]);
      setCurrentPageIndex(0);
      return;
    }

    let resizeObserver: ResizeObserver | null = null;
    let timeoutId: NodeJS.Timeout | null = null;

    // Wait for container to have a proper size
    const calculatePages = () => {
      const flatSections = flattenSections(outline.sections);
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
      
      // Reset to first page if current page is out of bounds
      if (currentPageIndex >= allCalculatedPages.length) {
        setCurrentPageIndex(0);
      }
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
  }, [outline, fontSize, lineHeight, viewportDimensions, currentPageIndex, flattenSections]);

  // Update current page index when section changes (for section-based navigation)
  useEffect(() => {
    if (allPages.length === 0) return;

    // Find first page of current section
    const firstPageOfSection = allPages.findIndex(
      page => page.sectionIndex === currentSectionIndex
    );
    
    if (firstPageOfSection >= 0) {
      setCurrentPageIndex(firstPageOfSection);
    }
  }, [currentSectionIndex, allPages]);

  // Helper to get flat sections - memoize to prevent recalculation
  const flatSections = useMemo(() => {
    return outline ? flattenSections(outline.sections || []) : [];
  }, [outline]);

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

  // Legacy section navigation (for sidebar)
  const goToSection = useCallback((index: number) => {
    if (allPages.length === 0) {
    setCurrentSectionIndex(index);
      return;
    }
    
    // Find first page of the section
    const firstPageOfSection = allPages.findIndex(
      page => page.sectionIndex === index
    );
    
    if (firstPageOfSection >= 0) {
      goToPage(firstPageOfSection);
    } else {
      setCurrentSectionIndex(index);
    }
  }, [allPages, goToPage]);

  // Swipe gesture handlers
  const swipeHandlers = useSwipeGesture({
    onSwipeLeft: goToNextPage,
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
          goToNextPage();
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
  }, [goToPreviousPage, goToNextPage, goToPage, allPages.length, isAnimating]);

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

  // Dummy data is always available, so no loading or empty states needed
  if (!outline || flatSections.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
        <Card className="bg-black/40 border-border/60 max-w-md">
          <CardContent className="p-8 text-center">
            <BookOpen className="h-16 w-16 mx-auto mb-4 text-primary/50" />
            <h2 className="text-2xl font-bold mb-2 text-white">Your Lore Book</h2>
            <p className="text-white/60 mb-4">
              Your book will appear here once you start building your memoir.
            </p>
            <p className="text-sm text-white/40">
              Go to "My Memoir" to create sections and start writing your story.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleGenerateFromSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setGenerating(true);
    try {
      // Use intelligent search parser
      const result = await fetchJson<{ biography: Biography; parsedQuery: any }>('/api/biography/search', {
        method: 'POST',
        body: JSON.stringify({ query: searchQuery.trim() })
      });

      if (result.biography) {
        // Convert biography to memoir outline format
        const newOutline: MemoirOutline = {
          id: result.biography.id,
          title: result.biography.title,
          lastUpdated: result.biography.metadata.generatedAt,
          autoUpdate: false,
          sections: result.biography.chapters.map((chapter, idx) => ({
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

        setOutline(newOutline);
        setCurrentSectionIndex(0);
        setSelectedBiography(result.biography);
        setShowGenerator(false);
        setSearchQuery('');
      }
    } catch (error) {
      console.error('Failed to generate biography:', error);
    } finally {
      setGenerating(false);
    }
  };

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

  const handleKnowledgeBaseGenerated = (biography: Biography) => {
    handleLoadBiography(biography);
    setShowKnowledgeBaseCreator(false);
  };

  const handleLoadBiography = (biography: Biography) => {
    const newOutline: MemoirOutline = {
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

    setOutline(newOutline);
    setCurrentSectionIndex(0);
    setSelectedBiography(biography);
    setShowSaved(false);
    setShowRecommendations(false);
  };

  const handleGenerateFromRecommendation = async (spec: BiographySpec & { characterIds?: string[]; locationIds?: string[]; eventIds?: string[]; skillIds?: string[] }, version?: string) => {
    setGenerating(true);
    setShowRecommendations(false);
    try {
      const result = await fetchJson<{ biography: Biography }>('/api/biography/generate', {
        method: 'POST',
        body: JSON.stringify(spec)
      });

      if (result.biography) {
        handleLoadBiography(result.biography);
      }
    } catch (error) {
      console.error('Failed to generate biography:', error);
    } finally {
      setGenerating(false);
    }
  };

  // Show recommendations if no book is loaded
  if (showRecommendations && (!outline || outline.sections.length === 0)) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex flex-col bg-gradient-to-br from-black via-purple-950/20 to-black p-8">
        <div className="max-w-6xl mx-auto w-full">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-white mb-2">Your Lorebook</h1>
            <p className="text-white/60">Choose a lorebook to generate or view your recommendations</p>
          </div>
          <BiographyRecommendations onGenerate={handleGenerateFromRecommendation} />
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full flex flex-col bg-gradient-to-br from-black via-purple-950/20 to-black overflow-hidden" style={{ minHeight: '100vh', height: '100vh' }}>
      {/* Search Bar Section - Above the book */}
      <div className="border-b border-border/50 p-4 bg-black/30">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold text-white">Search & Generate Lorebook</h3>
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowKnowledgeBaseCreator(true);
                  setShowRecommendations(false);
                  setShowSaved(false);
                }}
                className="text-white/60 hover:text-white bg-primary/10 hover:bg-primary/20"
                leftIcon={<Sparkles className="h-4 w-4" />}
              >
                Create Lorebook
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowSaved(!showSaved);
                  setShowRecommendations(false);
                }}
                className="text-white/60 hover:text-white"
              >
                {showSaved ? 'Hide' : 'Show'} Saved
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowRecommendations(!showRecommendations);
                  setShowSaved(false);
                }}
                className="text-white/60 hover:text-white"
              >
                {showRecommendations ? 'Hide' : 'Show'} Recommendations
              </Button>
            </div>
          </div>
          {showRecommendations && (
            <div className="mb-4 space-y-6">
              <LorebookRecommendations onGenerate={handleGenerateFromRecommendation} />
              <div className="border-t border-border/50 pt-6">
                <BiographyRecommendations onGenerate={handleGenerateFromRecommendation} />
              </div>
            </div>
          )}
          {showSaved && (
            <div className="mb-4">
              <SavedBiographies onLoadBiography={handleLoadBiography} />
            </div>
          )}
          {/* Instructions */}
          <div className="mb-3">
            <p className="text-sm text-white/70 leading-relaxed">
              <span className="font-medium text-white/90">Intelligent Lorebook Search:</span> Search by timeline ("my 2020 story"), characters ("my story with Sarah"), locations ("everything at the gym"), events ("the wedding"), skills ("my fighting journey"), or topics ("robotics", "relationships"). The system understands natural language and will generate the perfect lorebook for you.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/40" />
              <Input
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowQuerySuggestions(true);
                }}
                onFocus={() => setShowQuerySuggestions(true)}
                onBlur={() => setTimeout(() => setShowQuerySuggestions(false), 200)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !generating) {
                    handleGenerateFromSearch();
                    setShowQuerySuggestions(false);
                  }
                }}
                placeholder="e.g., 'my story with Sarah', 'everything at the gym', 'my 2020 story', 'my fighting journey'..."
                className="pl-10 bg-black/60 border-white/20 text-white placeholder:text-white/40"
              />
              {showQuerySuggestions && (
                <QuerySuggestions
                  query={searchQuery}
                  onSelect={(query) => {
                    setSearchQuery(query);
                    setShowQuerySuggestions(false);
                  }}
                  characters={characters}
                  locations={locations}
                  skills={skills}
                />
              )}
            </div>
            <Button
              onClick={handleGenerateFromSearch}
              disabled={!searchQuery.trim() || generating}
              className="bg-primary/20 hover:bg-primary/30 text-primary border-primary/30"
            >
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Header - Kindle Style */}
      <div className="border-b border-white/10 bg-[#1a1a1a] backdrop-blur-sm px-4 sm:px-8 py-3 sm:py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3 sm:gap-4">
          {/* Mobile Menu Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSidebar(!showSidebar)}
            className="lg:hidden text-white/70 hover:text-white"
            aria-label="Toggle sidebar"
          >
            {showSidebar ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
          
          <div className="flex items-center gap-2">
            <BookMarked className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            <h1 className="text-lg sm:text-xl font-bold text-white">{outline.title || 'My Lore Book'}</h1>
          </div>
          {allPages.length > 0 && (
            <div className="hidden sm:flex text-xs sm:text-sm text-white/50 bg-black/40 px-2 sm:px-3 py-1 rounded-full border border-white/10">
              Page {currentPageIndex + 1} of {allPages.length}
          </div>
          )}
        </div>
        
        {/* Header Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => setShowStats(!showStats)}
            className="px-3 py-1.5 bg-black/60 border border-white/10 rounded-md text-xs text-white hover:bg-black/80 transition-colors sm:text-sm"
            title="View Statistics"
          >
            Stats
          </button>
        
        {/* Reading Controls */}
          {/* Font Size */}
          <div className="flex items-center gap-1 sm:gap-2 bg-black/60 border border-white/10 rounded-lg px-2 sm:px-3 py-1 sm:py-1.5">
            <Type className="h-3 w-3 sm:h-4 sm:w-4 text-white/50" />
            <select
              value={fontSize}
              onChange={(e) => setFontSize(e.target.value as typeof fontSize)}
              className="bg-transparent border-none text-xs sm:text-sm text-white focus:outline-none cursor-pointer"
            >
              <option value="sm" className="bg-black">Small</option>
              <option value="base" className="bg-black">Normal</option>
              <option value="lg" className="bg-black">Large</option>
              <option value="xl" className="bg-black">Extra Large</option>
            </select>
          </div>
          
          {/* Line Height */}
          <div className="hidden sm:flex items-center gap-2 bg-black/60 border border-white/10 rounded-lg px-3 py-1.5">
            <AlignJustify className="h-4 w-4 text-white/50" />
            <select
              value={lineHeight}
              onChange={(e) => setLineHeight(e.target.value as typeof lineHeight)}
              className="bg-transparent border-none text-sm text-white focus:outline-none cursor-pointer"
            >
              <option value="normal" className="bg-black">Tight</option>
              <option value="relaxed" className="bg-black">Normal</option>
              <option value="loose" className="bg-black">Wide</option>
            </select>
          </div>
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
                      index === currentSectionIndex
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
              onClick={goToNextPage}
              disabled={currentPageIndex >= allPages.length - 1 || isAnimating}
              aria-label="Next page"
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

      {/* Navigation Footer - Kindle Style */}
      <div className="border-t border-white/10 bg-[#1a1a1a] backdrop-blur-sm px-4 sm:px-8 py-3 sm:py-4 flex items-center justify-between flex-shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={goToPreviousPage}
          disabled={currentPageIndex === 0 || isAnimating}
          className="text-white/70 hover:text-white disabled:opacity-30"
          leftIcon={<ChevronLeft className="h-4 w-4" />}
          aria-label="Previous page"
        >
          <span className="hidden sm:inline">Previous</span>
        </Button>

        {/* Page Progress Indicator */}
        <div className="flex flex-col items-center gap-1 flex-1 max-w-[60%]">
          <div className="text-xs sm:text-sm text-white/60">
            Page {currentPageIndex + 1} of {allPages.length}
            {allPages.length > 0 && (
              <span className="ml-2 text-white/40">
                ({Math.round(((currentPageIndex + 1) / allPages.length) * 100)}%)
              </span>
            )}
          </div>
          {/* Progress Bar */}
          {allPages.length > 0 && (
            <div className="w-full max-w-xs h-1 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${((currentPageIndex + 1) / allPages.length) * 100}%` }}
              />
            </div>
          )}
          {/* Section Dots (Mobile) */}
          <div className="flex items-center gap-1 sm:hidden px-2 py-1 bg-black/60 rounded-full border border-white/10 overflow-x-auto max-w-full">
            {flatSections.map((section, index) => {
              const sectionPages = allPages.filter(p => p.sectionIndex === index);
              const firstPageIndex = allPages.findIndex(p => p.sectionIndex === index);
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
          onClick={goToNextPage}
          disabled={currentPageIndex >= allPages.length - 1 || isAnimating}
          className="text-white/70 hover:text-white disabled:opacity-30"
          rightIcon={<ChevronRight className="h-4 w-4" />}
          aria-label="Next page"
        >
          <span className="hidden sm:inline">Next</span>
        </Button>
      </div>

      {/* Download Section */}
      <div className="border-t border-border/60 bg-black/50 backdrop-blur-sm px-8 py-4 flex items-center justify-center flex-shrink-0">
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

      {/* Ask Lore Book Chat Interface */}
      <div className="border-t border-border/60 bg-black/60 backdrop-blur-sm flex-shrink-0">
        <Button
          variant="ghost"
          onClick={() => setShowChat(!showChat)}
          className="w-full px-6 py-3 flex items-center justify-between hover:bg-black/40 transition rounded-none border-none"
          aria-label={showChat ? 'Hide chat' : 'Show chat'}
        >
          <div className="flex items-center gap-3">
            <MessageSquare className="h-5 w-5 text-primary" />
            <span className="text-white font-medium">Ask Lore Book</span>
            <span className="text-xs text-white/50 hidden sm:inline">Get insights about your story</span>
          </div>
          {showChat ? (
            <ChevronDown className="h-5 w-5 text-white/50" />
          ) : (
            <ChevronUp className="h-5 w-5 text-white/50" />
          )}
        </Button>
        
        {showChat && (
          <div className="border-t border-border/40 h-[600px] max-h-[60vh] flex flex-col overflow-hidden bg-black/40">
            <ChatFirstInterface />
          </div>
        )}
      </div>

      {/* Horizontal Timeline - At the bottom */}
      <div className="flex-shrink-0 border-t border-border/60 bg-black/50">
        <ColorCodedTimeline
          chapters={chapters}
          sections={flatSections.map(s => ({
            id: s.id,
            title: s.title,
            period: s.period
          }))}
          currentItemId={currentSection ? `section-${currentSection.id}` : undefined}
          onItemClick={(item) => {
            if (item.type === 'section' && item.sectionIndex !== undefined) {
              goToSection(item.sectionIndex);
            }
          }}
          showLabel={true}
          sectionIndexMap={new Map(flatSections.map((s, idx) => [s.id, idx]))}
        />
      </div>

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

