import { useRef, useEffect, useMemo } from 'react';
import { useMockData } from '../../contexts/MockDataContext';
import { BookOpenCheck, Sparkles, Layers, Clock, Star } from 'lucide-react';
import type { TimelineNode, TimelineLayer, LAYER_COLORS } from '../../types/timeline';

type Chapter = {
  id: string;
  title: string;
  start_date: string;
  end_date?: string | null;
  description?: string | null;
  summary?: string | null;
};

type Saga = {
  id: string;
  title: string;
  start_date: string;
  end_date?: string | null;
  description?: string | null;
};

type Arc = {
  id: string;
  title: string;
  start_date: string;
  end_date?: string | null;
  description?: string | null;
};

type Era = {
  id: string;
  title: string;
  start_date: string;
  end_date?: string | null;
  description?: string | null;
};

type TimelineItem = {
  id: string;
  title: string;
  type: 'chapter' | 'section' | 'entry' | 'saga' | 'arc' | 'era' | 'memory';
  date: string;
  endDate?: string | null;
  sectionIndex?: number;
  chapterId?: string;
  entryId?: string;
  sagaId?: string;
  arcId?: string;
  eraId?: string;
  zIndex?: number; // For overlapping items
};

type ColorCodedTimelineProps = {
  chapters?: Chapter[];
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
  sagas?: Saga[];
  arcs?: Arc[];
  eras?: Era[];
  memories?: Array<{
    id: string;
    title: string;
    date: string;
    type?: string;
  }>;
  hierarchyNodes?: TimelineNode[]; // Full hierarchy nodes for nested display
  currentItemId?: string;
  onItemClick?: (item: TimelineItem) => void;
  showLabel?: boolean;
  sectionIndexMap?: Map<string, number>; // Optional map of section ID to index for navigation
  useDummyData?: boolean; // Option to use dummy data (deprecated - use mock data toggle)
};

// Dummy data for timeline visualization
const generateDummyTimelineData = () => {
  const now = new Date();
  const twoYearsAgo = new Date(now.getFullYear() - 2, now.getMonth(), 1);
  
  const dummyEras: Era[] = [
    {
      id: 'era-1',
      title: 'The Awakening Era',
      start_date: new Date(now.getFullYear() - 2, 0, 1).toISOString(),
      end_date: new Date(now.getFullYear() - 1, 5, 30).toISOString(),
      description: 'A period of self-discovery and finding purpose'
    },
    {
      id: 'era-2',
      title: 'The Growth Era',
      start_date: new Date(now.getFullYear() - 1, 6, 1).toISOString(),
      end_date: new Date(now.getFullYear(), 5, 30).toISOString(),
      description: 'Building foundations and establishing routines'
    },
    {
      id: 'era-3',
      title: 'The Transformation Era',
      start_date: new Date(now.getFullYear(), 6, 1).toISOString(),
      end_date: null,
      description: 'Current era of transformation and new perspectives'
    }
  ];

  const dummySagas: Saga[] = [
    {
      id: 'saga-1',
      title: 'The Journey of Self-Discovery',
      start_date: new Date(now.getFullYear() - 2, 2, 1).toISOString(),
      end_date: new Date(now.getFullYear() - 1, 8, 30).toISOString(),
      description: 'A long-form narrative about personal growth'
    },
    {
      id: 'saga-2',
      title: 'Building Meaningful Connections',
      start_date: new Date(now.getFullYear() - 1, 3, 1).toISOString(),
      end_date: new Date(now.getFullYear(), 2, 28).toISOString(),
      description: 'Stories of relationships and community'
    },
    {
      id: 'saga-3',
      title: 'Creative Pursuits',
      start_date: new Date(now.getFullYear() - 1, 9, 1).toISOString(),
      end_date: null,
      description: 'Ongoing creative projects and artistic expression'
    }
  ];

  const dummyArcs: Arc[] = [
    {
      id: 'arc-1',
      title: 'Learning to Code',
      start_date: new Date(now.getFullYear() - 1, 0, 15).toISOString(),
      end_date: new Date(now.getFullYear() - 1, 6, 30).toISOString(),
      description: 'The coding journey arc'
    },
    {
      id: 'arc-2',
      title: 'Writing the Novel',
      start_date: new Date(now.getFullYear() - 1, 4, 1).toISOString(),
      end_date: new Date(now.getFullYear(), 0, 31).toISOString(),
      description: 'Novel writing process'
    },
    {
      id: 'arc-3',
      title: 'Mindfulness Practice',
      start_date: new Date(now.getFullYear() - 1, 8, 1).toISOString(),
      end_date: null,
      description: 'Developing mindfulness and meditation'
    }
  ];

  const dummyChapters: Chapter[] = [
    {
      id: 'chapter-1',
      title: 'The Beginning',
      start_date: new Date(now.getFullYear() - 2, 0, 1).toISOString(),
      end_date: new Date(now.getFullYear() - 1, 5, 30).toISOString(),
      description: 'Starting the journey',
      summary: 'The first chapter of the story'
    },
    {
      id: 'chapter-2',
      title: 'Growth & Discovery',
      start_date: new Date(now.getFullYear() - 1, 6, 1).toISOString(),
      end_date: new Date(now.getFullYear() - 1, 11, 31).toISOString(),
      description: 'A period of learning',
      summary: 'Building skills and relationships'
    },
    {
      id: 'chapter-3',
      title: 'Challenges & Resilience',
      start_date: new Date(now.getFullYear(), 0, 1).toISOString(),
      end_date: new Date(now.getFullYear(), 5, 30).toISOString(),
      description: 'Facing obstacles',
      summary: 'Learning resilience'
    },
    {
      id: 'chapter-4',
      title: 'Transformation',
      start_date: new Date(now.getFullYear(), 6, 1).toISOString(),
      end_date: new Date(now.getFullYear(), 9, 30).toISOString(),
      description: 'Personal transformation',
      summary: 'New perspectives emerging'
    },
    {
      id: 'chapter-5',
      title: 'Living Intentionally',
      start_date: new Date(now.getFullYear(), 10, 1).toISOString(),
      end_date: null,
      description: 'Current chapter',
      summary: 'Living with purpose'
    }
  ];

  const dummyMemories: Array<{ id: string; title: string; date: string; type?: string }> = [];
  // Generate memories spread across the timeline
  for (let i = 0; i < 30; i++) {
    const daysAgo = Math.floor(Math.random() * 730); // Random date within last 2 years
    const memoryDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    dummyMemories.push({
      id: `memory-${i}`,
      title: `Memory ${i + 1}`,
      date: memoryDate.toISOString(),
      type: ['milestone', 'reflection', 'achievement', 'conversation', 'insight'][Math.floor(Math.random() * 5)]
    });
  }

  return { eras: dummyEras, sagas: dummySagas, arcs: dummyArcs, chapters: dummyChapters, memories: dummyMemories };
};

export const ColorCodedTimeline = ({
  chapters = [],
  sections = [],
  entries = [],
  sagas = [],
  arcs = [],
  eras = [],
  memories = [],
  hierarchyNodes = [],
  currentItemId,
  onItemClick,
  showLabel = true,
  sectionIndexMap,
  useDummyData = false
}: ColorCodedTimelineProps) => {
  const timelineRef = useRef<HTMLDivElement>(null);
  
  // Import LAYER_COLORS from types
  const LAYER_COLORS: Record<string, string> = {
    mythos: '#6B21A8',
    epoch: '#DC2626',
    era: '#D97706',
    saga: '#0891B2',
    arc: '#16A34A',
    chapter: '#2563EB',
    scene: '#6B7280',
    action: '#374151',
    microaction: '#000000'
  };

  // Layer depth mapping for nested rendering
  const LAYER_DEPTH: Record<string, number> = {
    mythos: 0,
    epoch: 1,
    era: 2,
    saga: 3,
    arc: 4,
    chapter: 5,
    scene: 6,
    action: 7,
    microaction: 8
  };
  
  // Use dummy data if requested or if no real data exists
  // Check mock data toggle
  const { useMockData: isMockDataEnabled } = useMockData();
  const shouldUseDummy = useDummyData || (isMockDataEnabled && hierarchyNodes.length === 0 && chapters.length === 0 && sections.length === 0 && entries.length === 0);
  
  const dummyData = shouldUseDummy 
    ? generateDummyTimelineData() 
    : { eras: [], sagas: [], arcs: [], chapters: [], memories: [] };
  
  const finalChapters = chapters.length > 0 ? chapters : dummyData.chapters;
  const finalSagas = sagas.length > 0 ? sagas : dummyData.sagas;
  const finalArcs = arcs.length > 0 ? arcs : dummyData.arcs;
  const finalEras = eras.length > 0 ? eras : dummyData.eras;
  const finalMemories = memories.length > 0 ? memories : dummyData.memories;

  // Build nested hierarchy structure from hierarchyNodes
  const buildNestedHierarchy = useMemo(() => {
    if (hierarchyNodes.length === 0) return null;

    // Create a map of nodes by ID
    const nodeMap = new Map<string, TimelineNode & { children: TimelineNode[]; layer: TimelineLayer }>();
    const rootNodes: Array<TimelineNode & { children: TimelineNode[]; layer: TimelineLayer }> = [];

    // Determine layer for each node - we need to track which layer each node came from
    // Since nodes don't have layer info directly, we'll infer from parent relationships
    // or use a map if we can determine it from the API response
    const layerMap = new Map<string, TimelineLayer>();
    
    // First, identify mythos nodes (no parent)
    hierarchyNodes.forEach(node => {
      if (!node.parent_id) {
        layerMap.set(node.id, 'mythos');
      }
    });
    
    // Then recursively determine child layers based on parent
    const getNodeLayer = (node: TimelineNode): TimelineLayer => {
      if (layerMap.has(node.id)) {
        return layerMap.get(node.id)!;
      }
      
      // Try to infer from metadata
      if (node.metadata && typeof node.metadata.layer === 'string') {
        const layer = node.metadata.layer as TimelineLayer;
        layerMap.set(node.id, layer);
        return layer;
      }
      
      // Infer from parent layer
      if (node.parent_id && layerMap.has(node.parent_id)) {
        const parentLayer = layerMap.get(node.parent_id)!;
        const childLayerMap: Record<TimelineLayer, TimelineLayer | null> = {
          mythos: 'epoch',
          epoch: 'era',
          era: 'saga',
          saga: 'arc',
          arc: 'chapter',
          chapter: 'scene',
          scene: 'action',
          action: 'microaction',
          microaction: null
        };
        const childLayer = childLayerMap[parentLayer];
        if (childLayer) {
          layerMap.set(node.id, childLayer);
          return childLayer;
        }
      }
      
      // Default to chapter if we can't determine
      const defaultLayer: TimelineLayer = 'chapter';
      layerMap.set(node.id, defaultLayer);
      return defaultLayer;
    };

    // First pass: create all nodes
    hierarchyNodes.forEach(node => {
      const layer = getNodeLayer(node);
      nodeMap.set(node.id, { ...node, children: [], layer });
    });

    // Second pass: build parent-child relationships
    hierarchyNodes.forEach(node => {
      const nodeWithChildren = nodeMap.get(node.id)!;
      if (node.parent_id && nodeMap.has(node.parent_id)) {
        const parent = nodeMap.get(node.parent_id)!;
        parent.children.push(node);
      } else {
        rootNodes.push(nodeWithChildren);
      }
    });

    return { nodeMap, rootNodes };
  }, [hierarchyNodes]);

  // Generate distinct colors for different types
  const generateColorPalette = (count: number, baseHue: number = 0): string[] => {
    const colors: string[] = [];
    const hueStep = 360 / Math.max(count, 1);
    
    for (let i = 0; i < count; i++) {
      const hue = (baseHue + i * hueStep) % 360;
      const saturation = 70 + (i % 3) * 10;
      const lightness = 50 + (i % 2) * 5;
      colors.push(`hsl(${hue}, ${saturation}%, ${lightness}%)`);
    }
    
    return colors;
  };

  // Color schemes for different types
  const eraColors = generateColorPalette(finalEras.length, 0); // Red/pink tones
  const sagaColors = generateColorPalette(finalSagas.length, 120); // Green tones
  const arcColors = generateColorPalette(finalArcs.length, 240); // Blue tones
  const chapterColors = generateColorPalette(finalChapters.length, 270); // Purple tones
  
  const eraColorMap = new Map<string, string>();
  finalEras.forEach((era, index) => {
    eraColorMap.set(era.id, eraColors[index]);
  });

  const sagaColorMap = new Map<string, string>();
  finalSagas.forEach((saga, index) => {
    sagaColorMap.set(saga.id, sagaColors[index]);
  });

  const arcColorMap = new Map<string, string>();
  finalArcs.forEach((arc, index) => {
    arcColorMap.set(arc.id, arcColors[index]);
  });

  const chapterColorMap = new Map<string, string>();
  finalChapters.forEach((chapter, index) => {
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

  const sectionEraColors = generateColorPalette(sectionEras.size, 60); // Yellow/orange tones
  const sectionEraColorMap = new Map<string, string>();
  Array.from(sectionEras.keys()).forEach((eraKey, index) => {
    sectionEraColorMap.set(eraKey, sectionEraColors[index]);
  });

  // Build timeline items from hierarchy nodes (nested) or legacy data (flat)
  const buildTimelineItems = (): TimelineItem[] => {
    const items: TimelineItem[] = [];
    
    // If we have hierarchy nodes, build nested structure
    if (buildNestedHierarchy && buildNestedHierarchy.rootNodes.length > 0) {
      const { rootNodes, nodeMap } = buildNestedHierarchy;
      
      // Recursively add nodes with nested depth
      const addNodeRecursive = (node: TimelineNode & { children: TimelineNode[]; layer: TimelineLayer }, depth: number = 0) => {
        const layerDepth = LAYER_DEPTH[node.layer] ?? depth;
        const itemType = node.layer as TimelineItem['type'];
        
        items.push({
          id: `${node.layer}-${node.id}`,
          title: node.title,
          type: itemType,
          date: node.start_date,
          endDate: node.end_date || null,
          zIndex: layerDepth, // Use layer depth for nesting
        });
        
        // Add children recursively
        node.children.forEach(child => {
          const childNode = nodeMap.get(child.id);
          if (childNode) {
            addNodeRecursive(childNode, depth + 1);
          }
        });
      };
      
      rootNodes.forEach(root => {
        addNodeRecursive(root);
      });
      
      return items;
    }
    
    // Legacy flat structure (if no hierarchy nodes)
    // Add eras (highest level, background layer)
    finalEras.forEach((era, index) => {
      items.push({
        id: `era-${era.id}`,
        title: era.title,
        type: 'era',
        date: era.start_date,
        endDate: era.end_date || null,
        eraId: era.id,
        zIndex: 1 // Background layer
      });
    });
    
    // Add sagas (overlapping with eras)
    finalSagas.forEach((saga, index) => {
      items.push({
        id: `saga-${saga.id}`,
        title: saga.title,
        type: 'saga',
        date: saga.start_date,
        endDate: saga.end_date || null,
        sagaId: saga.id,
        zIndex: 2
      });
    });
    
    // Add arcs (overlapping with sagas and eras)
    finalArcs.forEach((arc, index) => {
      items.push({
        id: `arc-${arc.id}`,
        title: arc.title,
        type: 'arc',
        date: arc.start_date,
        endDate: arc.end_date || null,
        arcId: arc.id,
        zIndex: 3
      });
    });
    
    // Add chapters (overlapping with arcs)
    finalChapters.forEach(chapter => {
      items.push({
        id: `chapter-${chapter.id}`,
        title: chapter.title,
        type: 'chapter',
        date: chapter.start_date,
        endDate: chapter.end_date || null,
        chapterId: chapter.id,
        zIndex: 4
      });
    });
    
    // Add memoir sections
    sections.forEach((section, index) => {
      const sectionIndex = sectionIndexMap?.get(section.id) ?? index;
      items.push({
        id: `section-${section.id}`,
        title: section.title,
        type: 'section',
        date: section.period?.from || new Date().toISOString(),
        endDate: section.period?.to || null,
        sectionIndex: sectionIndex,
        zIndex: 5
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
        chapterId: entry.chapter_id || undefined,
        zIndex: 6
      });
    });
    
    // Add memories (scattered points)
    finalMemories.forEach((memory, index) => {
      items.push({
        id: `memory-${memory.id}`,
        title: memory.title,
        type: 'memory',
        date: memory.date,
        zIndex: 7 + (index % 3) // Vary z-index for visual depth
      });
    });
    
    // Sort by date chronologically, then by z-index for overlapping
    return items.sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      if (Math.abs(dateA - dateB) < 7 * 24 * 60 * 60 * 1000) { // Within 7 days
        return (a.zIndex || 0) - (b.zIndex || 0); // Sort by z-index for overlapping
      }
      return dateA - dateB;
    });
  };

  const timelineItems = buildTimelineItems();

  // Get color for a timeline item
  const getItemColor = (item: TimelineItem): string => {
    // If using hierarchy nodes, use layer colors
    if (buildNestedHierarchy) {
      return LAYER_COLORS[item.type] || '#6B7280';
    }
    
    // Legacy color mapping
    if (item.type === 'era' && item.eraId) {
      return eraColorMap.get(item.eraId) || 'hsl(0, 70%, 50%)';
    } else if (item.type === 'saga' && item.sagaId) {
      return sagaColorMap.get(item.sagaId) || 'hsl(120, 70%, 50%)';
    } else if (item.type === 'arc' && item.arcId) {
      return arcColorMap.get(item.arcId) || 'hsl(240, 70%, 50%)';
    } else if (item.type === 'chapter' && item.chapterId) {
      return chapterColorMap.get(item.chapterId) || 'hsl(270, 70%, 50%)';
    } else if (item.type === 'section' && item.date) {
      const eraKey = new Date(item.date).getFullYear().toString();
      return sectionEraColorMap.get(eraKey) || 'hsl(60, 70%, 50%)';
    } else if (item.type === 'entry' && item.chapterId) {
      return chapterColorMap.get(item.chapterId) || 'hsl(200, 70%, 50%)';
    } else if (item.type === 'memory') {
      // Memories get a subtle color based on their type
      return 'hsl(300, 50%, 60%)'; // Light purple for memories
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
    <div className="border-b border-border/60 bg-black/40 px-6 py-4 flex-shrink-0 overflow-x-hidden w-full">
      {showLabel && (
        <div className="flex items-center gap-4 mb-3">
          <div className="flex items-center gap-2">
            <BookOpenCheck className="h-4 w-4 text-primary/70" />
            <span className="text-xs text-white/50 font-medium">Timeline</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-white/40">
            {finalEras.length > 0 && (
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded" style={{ backgroundColor: eraColors[0] }} />
                <span>Eras</span>
              </div>
            )}
            {finalSagas.length > 0 && (
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded" style={{ backgroundColor: sagaColors[0] }} />
                <span>Sagas</span>
              </div>
            )}
            {finalArcs.length > 0 && (
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded" style={{ backgroundColor: arcColors[0] }} />
                <span>Arcs</span>
              </div>
            )}
            {finalChapters.length > 0 && (
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded" style={{ backgroundColor: chapterColors[0] }} />
                <span>Chapters</span>
              </div>
            )}
            {finalMemories.length > 0 && (
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'hsl(300, 50%, 60%)' }} />
                <span>Memories</span>
              </div>
            )}
          </div>
        </div>
      )}
      <div 
        ref={timelineRef}
        className="relative overflow-x-auto overflow-y-hidden pb-4 pt-2 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-track]:bg-black/20]"
        style={{ minHeight: buildNestedHierarchy ? '300px' : '200px', maxWidth: '100%' }}
      >
        {/* Render nested hierarchy with vertical rows */}
        {buildNestedHierarchy ? (
          // Nested rendering: each layer gets its own row
          <div className="relative" style={{ minHeight: '280px' }}>
            {Array.from({ length: 9 }, (_, depth) => {
              const layerItems = timelineItems.filter(item => (item.zIndex || 0) === depth);
              if (layerItems.length === 0) return null;
              
              return (
                <div
                  key={depth}
                  className="absolute left-0 right-0 flex gap-2"
                  style={{
                    top: `${depth * 32 + 8}px`,
                    height: '28px',
                    zIndex: 9 - depth // Higher layers on top
                  }}
                >
                  {layerItems.map((item) => {
                    const isCurrent = currentItemId === item.id;
                    const layerColor = LAYER_COLORS[item.type] || '#6B7280';
                    const depth = item.zIndex || 0;
                    
                    return (
                      <div
                        key={item.id}
                        data-item-id={item.id}
                        onClick={() => onItemClick?.(item)}
                        className={`relative rounded transition-all cursor-pointer ${
                          isCurrent ? 'ring-2 ring-primary ring-offset-2 ring-offset-black' : 'hover:opacity-80'
                        }`}
                        style={{
                          backgroundColor: layerColor,
                          opacity: depth === 0 ? 0.2 : depth === 1 ? 0.3 : depth === 2 ? 0.4 : depth === 3 ? 0.5 : depth === 4 ? 0.6 : 0.7,
                          minWidth: '120px',
                          height: '24px',
                          marginTop: '2px',
                          padding: '2px 8px',
                          fontSize: '11px',
                          color: 'white',
                          fontWeight: depth <= 2 ? 'bold' : 'normal'
                        }}
                        title={item.title}
                      >
                        <span className="truncate block">{item.title}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ) : (
          // Legacy flat rendering
          <div className="flex gap-2">
        {timelineItems.map((item) => {
          const isChapter = item.type === 'chapter';
          const isEntry = item.type === 'entry';
          const isSaga = item.type === 'saga';
          const isArc = item.type === 'arc';
          const isEra = item.type === 'era';
          const isMemory = item.type === 'memory';
          const isCurrent = currentItemId === item.id;
          const itemColor = getItemColor(item);
          const rgb = hslToRgb(itemColor);
          
          // Different opacity and styling based on type
          const getOpacity = () => {
            if (isEra) return 0.15; // Background eras are subtle
            if (isSaga) return 0.2;
            if (isArc) return 0.25;
            if (isChapter) return 0.3;
            if (isMemory) return 0.4;
            return 0.2;
          };
          
          const borderColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${isEra ? 0.3 : isSaga ? 0.4 : isArc ? 0.5 : 0.6})`;
          const bgColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${isCurrent ? getOpacity() * 2 : getOpacity()})`;
          const textColor = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
          const textColorLight = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.8)`;
          const textColorLighter = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.6)`;
          
          // Calculate position for overlapping (stack items that overlap in time)
          const itemDate = new Date(item.date).getTime();
          const overlappingItems = timelineItems.filter(other => {
            if (other.id === item.id) return false;
            const otherDate = new Date(other.date).getTime();
            const daysDiff = Math.abs(itemDate - otherDate) / (1000 * 60 * 60 * 24);
            return daysDiff < 30; // Items within 30 days overlap
          });
          
          const overlapIndex = overlappingItems.findIndex(other => {
            const otherDate = new Date(other.date).getTime();
            return otherDate < itemDate;
          });
          
          return (
            <div
              key={item.id}
              data-item-id={item.id}
              className={`flex-shrink-0 flex flex-col items-start gap-1 px-3 py-2 rounded-lg border transition-all ${
                isMemory 
                  ? 'min-w-[80px] max-w-[100px]' 
                  : isEra 
                    ? 'min-w-[300px] max-w-[400px]' 
                    : isSaga || isArc
                      ? 'min-w-[250px] max-w-[300px]'
                      : 'min-w-[200px] max-w-[250px]'
              } ${
                isCurrent
                  ? 'shadow-lg scale-105 cursor-pointer'
                  : 'cursor-pointer hover:scale-102'
              }`}
              style={{
                borderColor: isCurrent ? borderColor : borderColor,
                backgroundColor: isCurrent ? bgColor : bgColor,
                boxShadow: isCurrent ? `0 10px 40px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3)` : isEra ? `0 2px 10px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.1)` : 'none',
                zIndex: item.zIndex || 1,
                marginTop: overlapIndex >= 0 ? `${overlapIndex * 8}px` : '0',
                position: 'relative'
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
                {isEra ? (
                  <Layers className="h-4 w-4 flex-shrink-0" style={{ color: textColor }} />
                ) : isSaga ? (
                  <Star className="h-4 w-4 flex-shrink-0" style={{ color: textColor }} />
                ) : isArc ? (
                  <Sparkles className="h-4 w-4 flex-shrink-0" style={{ color: textColor }} />
                ) : isChapter ? (
                  <BookOpenCheck className="h-4 w-4 flex-shrink-0" style={{ color: textColor }} />
                ) : isMemory ? (
                  <div 
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{
                      backgroundColor: isCurrent ? textColor : textColorLight
                    }}
                  />
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
                  {isEra ? 'Era' : isSaga ? 'Saga' : isArc ? 'Arc' : isChapter ? 'Chapter' : isEntry ? 'Entry' : isMemory ? 'Memory' : `Section ${(item.sectionIndex || 0) + 1}`}
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
        )}
      </div>
    </div>
  );
};

