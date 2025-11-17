import { useRef, useEffect } from 'react';
import { BookOpenCheck } from 'lucide-react';

type Chapter = {
  id: string;
  title: string;
  start_date: string;
  end_date?: string | null;
  description?: string | null;
  summary?: string | null;
};

type TimelineItem = {
  id: string;
  title: string;
  type: 'chapter' | 'section' | 'entry';
  date: string;
  endDate?: string | null;
  sectionIndex?: number;
  chapterId?: string;
  entryId?: string;
};

type ColorCodedTimelineProps = {
  chapters: Chapter[];
  sections?: Array<{
    id: string;
    title: string;
    period?: { from: string; to: string };
    order?: number;
  }>;
  entries?: Array<{
    id: string;
    content: string;
    date: string;
    chapter_id?: string | null;
  }>;
  currentItemId?: string;
  onItemClick?: (item: TimelineItem) => void;
  showLabel?: boolean;
  sectionIndexMap?: Map<string, number>; // Optional map of section ID to index for navigation
};

export const ColorCodedTimeline = ({
  chapters,
  sections = [],
  entries = [],
  currentItemId,
  onItemClick,
  showLabel = true,
  sectionIndexMap
}: ColorCodedTimelineProps) => {
  const timelineRef = useRef<HTMLDivElement>(null);

  // Generate distinct colors for chapters and eras
  const generateColorPalette = (count: number): string[] => {
    const colors: string[] = [];
    const hueStep = 360 / Math.max(count, 1);
    
    for (let i = 0; i < count; i++) {
      const hue = (i * hueStep) % 360;
      const saturation = 70 + (i % 3) * 10;
      const lightness = 50 + (i % 2) * 5;
      colors.push(`hsl(${hue}, ${saturation}%, ${lightness}%)`);
    }
    
    return colors;
  };

  // Assign colors to chapters
  const chapterColors = generateColorPalette(chapters.length);
  const chapterColorMap = new Map<string, string>();
  chapters.forEach((chapter, index) => {
    chapterColorMap.set(chapter.id, chapterColors[index]);
  });

  // Group sections by era (time period) and assign colors
  const sectionEras = new Map<string, Array<{ id: string; title: string; period?: { from: string; to: string } }>>();
  sections.forEach(section => {
    const eraKey = section.period?.from 
      ? new Date(section.period.from).getFullYear().toString()
      : 'unknown';
    if (!sectionEras.has(eraKey)) {
      sectionEras.set(eraKey, []);
    }
    sectionEras.get(eraKey)!.push(section);
  });

  const eraColors = generateColorPalette(sectionEras.size);
  const eraColorMap = new Map<string, string>();
  Array.from(sectionEras.keys()).forEach((eraKey, index) => {
    eraColorMap.set(eraKey, eraColors[index]);
  });

  // Build timeline items
  const buildTimelineItems = (): TimelineItem[] => {
    const items: TimelineItem[] = [];
    
    // Add chapters
    chapters.forEach(chapter => {
      items.push({
        id: `chapter-${chapter.id}`,
        title: chapter.title,
        type: 'chapter',
        date: chapter.start_date,
        endDate: chapter.end_date || null,
        chapterId: chapter.id
      });
    });
    
    // Add memoir sections
    sections.forEach((section, index) => {
      // Use provided index map if available, otherwise use array index
      const sectionIndex = sectionIndexMap?.get(section.id) ?? index;
      items.push({
        id: `section-${section.id}`,
        title: section.title,
        type: 'section',
        date: section.period?.from || new Date().toISOString(),
        endDate: section.period?.to || null,
        sectionIndex: sectionIndex
      });
    });
    
    // Add entries (optional, for more granular timeline)
    entries.forEach(entry => {
      items.push({
        id: `entry-${entry.id}`,
        title: entry.content.substring(0, 50) + (entry.content.length > 50 ? '...' : ''),
        type: 'entry',
        date: entry.date,
        entryId: entry.id,
        chapterId: entry.chapter_id || undefined
      });
    });
    
    // Sort by date chronologically
    return items.sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return dateA - dateB;
    });
  };

  const timelineItems = buildTimelineItems();

  // Get color for a timeline item
  const getItemColor = (item: TimelineItem): string => {
    if (item.type === 'chapter' && item.chapterId) {
      return chapterColorMap.get(item.chapterId) || 'hsl(270, 70%, 50%)';
    } else if (item.type === 'section' && item.date) {
      const eraKey = new Date(item.date).getFullYear().toString();
      return eraColorMap.get(eraKey) || 'hsl(200, 70%, 50%)';
    } else if (item.type === 'entry' && item.chapterId) {
      return chapterColorMap.get(item.chapterId) || 'hsl(200, 70%, 50%)';
    }
    return 'hsl(200, 70%, 50%)';
  };

  // Scroll to current item
  useEffect(() => {
    if (currentItemId && timelineRef.current) {
      const currentItem = Array.from(timelineRef.current.children).find(
        (child) => child.getAttribute('data-item-id') === currentItemId
      ) as HTMLElement;
      
      if (currentItem) {
        const container = timelineRef.current;
        const itemLeft = currentItem.offsetLeft;
        const itemWidth = currentItem.offsetWidth;
        const containerWidth = container.offsetWidth;
        const scrollLeft = itemLeft - (containerWidth / 2) + (itemWidth / 2);
        
        container.scrollTo({
          left: scrollLeft,
          behavior: 'smooth'
        });
      }
    }
  }, [currentItemId]);

  // Convert HSL to RGB
  const hslToRgb = (hsl: string): { r: number; g: number; b: number } => {
    const match = hsl.match(/\d+/g);
    if (!match) return { r: 155, g: 92, b: 255 };
    const h = parseInt(match[0]) / 360;
    const s = parseInt(match[1]) / 100;
    const l = parseInt(match[2]) / 100;
    
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h * 6) % 2 - 1));
    const m = l - c / 2;
    
    let r = 0, g = 0, b = 0;
    if (h < 1/6) { r = c; g = x; b = 0; }
    else if (h < 2/6) { r = x; g = c; b = 0; }
    else if (h < 3/6) { r = 0; g = c; b = x; }
    else if (h < 4/6) { r = 0; g = x; b = c; }
    else if (h < 5/6) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }
    
    return {
      r: Math.round((r + m) * 255),
      g: Math.round((g + m) * 255),
      b: Math.round((b + m) * 255)
    };
  };

  return (
    <div className="border-b border-border/60 bg-black/40 px-6 py-4 flex-shrink-0">
      {showLabel && (
        <div className="flex items-center gap-2 mb-2">
          <BookOpenCheck className="h-4 w-4 text-primary/70" />
          <span className="text-xs text-white/50 font-medium">Timeline - Chapters & Eras</span>
        </div>
      )}
      <div 
        ref={timelineRef}
        className="flex gap-3 overflow-x-auto pb-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
      >
        {timelineItems.map((item) => {
          const isChapter = item.type === 'chapter';
          const isEntry = item.type === 'entry';
          const isCurrent = currentItemId === item.id;
          const itemColor = getItemColor(item);
          const rgb = hslToRgb(itemColor);
          
          const borderColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.5)`;
          const bgColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${isCurrent ? 0.2 : isChapter ? 0.1 : 0.05})`;
          const textColor = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
          const textColorLight = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.7)`;
          const textColorLighter = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.5)`;
          
          return (
            <div
              key={item.id}
              data-item-id={item.id}
              className={`flex-shrink-0 flex flex-col items-start gap-1 px-4 py-2 rounded-lg border transition-all min-w-[200px] max-w-[250px] ${
                isCurrent
                  ? 'shadow-lg scale-105 cursor-pointer'
                  : 'cursor-pointer hover:scale-102'
              }`}
              style={{
                borderColor: isCurrent ? borderColor : isChapter ? borderColor : `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3)`,
                backgroundColor: isCurrent ? bgColor : isChapter ? bgColor : `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.05)`,
                boxShadow: isCurrent ? `0 10px 40px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.2)` : 'none'
              }}
              onClick={() => {
                if (isChapter && onItemClick) {
                  onItemClick({ ...item, chapterId: item.chapterId });
                } else if (!isChapter && onItemClick) {
                  onItemClick({ ...item, entryId: item.entryId });
                }
              }}
              onMouseEnter={(e) => {
                if (!isCurrent) {
                  e.currentTarget.style.backgroundColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${isChapter ? 0.15 : 0.1})`;
                  e.currentTarget.style.borderColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.5)`;
                }
              }}
              onMouseLeave={(e) => {
                if (!isCurrent) {
                  e.currentTarget.style.backgroundColor = isChapter ? bgColor : `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.05)`;
                  e.currentTarget.style.borderColor = isChapter ? borderColor : `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3)`;
                }
              }}
            >
              <div className="flex items-center gap-2 w-full">
                {isChapter ? (
                  <BookOpenCheck className="h-4 w-4 flex-shrink-0" style={{ color: textColor }} />
                ) : (
                  <div 
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{
                      backgroundColor: isCurrent ? textColor : textColorLight
                    }}
                  />
                )}
                <span 
                  className="text-xs font-medium truncate"
                  style={{
                    color: isCurrent ? textColor : textColorLight
                  }}
                >
                  {isChapter ? 'Chapter' : isEntry ? 'Entry' : `Section ${(item.sectionIndex || 0) + 1}`}
                </span>
              </div>
              <span 
                className="text-sm font-semibold truncate w-full text-left"
                style={{
                  color: isCurrent ? 'white' : textColorLight
                }}
              >
                {item.title}
              </span>
              <span 
                className="text-xs truncate w-full text-left"
                style={{
                  color: isCurrent ? textColorLighter : `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.4)`
                }}
              >
                {new Date(item.date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                {item.endDate && ` - ${new Date(item.endDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

