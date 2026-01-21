import { useState, useEffect } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, BookMarked, MessageSquare, ChevronUp, ChevronDown, Type, AlignJustify, Search, Sparkles, Loader2, Download } from 'lucide-react';
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
import type { Biography, BiographySpec } from '../../../server/src/services/biographyGeneration/types';

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
  const [fontSize, setFontSize] = useState<'sm' | 'base' | 'lg' | 'xl'>('base');
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

        // Use mock data only if toggle is enabled and no real data
        if (!loadedOutline && isMockDataEnabled) {
          loadedOutline = dummyBook;
        } else if (!loadedOutline) {
          loadedOutline = {
            id: 'default',
            title: 'My Lore Book',
            sections: [],
            lastUpdated: new Date().toISOString(),
            autoUpdate: false
          };
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
        } else if (isMockDataEnabled) {
          setChapters(dummyChapters);
        } else {
          setChapters([]);
        }
      } catch (error) {
        console.error('Failed to load lore book data:', error);
        if (isMockDataEnabled) {
          setOutline(dummyBook);
          setChapters(dummyChapters);
        } else {
          setOutline({
            id: 'default',
            title: 'My Lore Book',
            sections: [],
            lastUpdated: new Date().toISOString(),
            autoUpdate: false
          });
          setChapters([]);
        }
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!outline) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center text-white/60">
          <BookOpen className="h-12 w-12 mx-auto mb-4 text-white/40" />
          <p>No lore book available</p>
          {isMockDataEnabled && (
            <p className="text-xs text-yellow-400/80 mt-2">Mock data toggle is enabled</p>
          )}
        </div>
      </div>
    );
  }

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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!outline) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center text-white/60">
          <BookOpen className="h-12 w-12 mx-auto mb-4 text-white/40" />
          <p>No lore book available</p>
          {isMockDataEnabled && (
            <p className="text-xs text-yellow-400/80 mt-2">Mock data toggle is enabled</p>
          )}
        </div>
      </div>
    );
  }

  const flatSections = outline ? flattenSections(outline.sections) : [];
  const currentSection = flatSections[currentSectionIndex];
  const totalSections = flatSections.length;

  const goToPrevious = () => {
    if (currentSectionIndex > 0) {
      setCurrentSectionIndex(currentSectionIndex - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const goToNext = () => {
    if (currentSectionIndex < totalSections - 1) {
      setCurrentSectionIndex(currentSectionIndex + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const goToSection = (index: number) => {
    setCurrentSectionIndex(index);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

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
    <div className="min-h-[calc(100vh-4rem)] flex flex-col bg-gradient-to-br from-black via-purple-950/20 to-black">
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

      {/* Header */}
      <div className="border-b border-border/60 bg-black/40 backdrop-blur-sm px-8 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <BookMarked className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold text-white">{outline.title || 'My Lore Book'}</h1>
          </div>
          <div className="text-sm text-white/50 bg-black/40 px-3 py-1 rounded-full border border-border/30">
            Section {currentSectionIndex + 1} of {totalSections}
          </div>
        </div>
        
        {/* Reading Controls */}
        <div className="flex items-center gap-3">
          {/* Font Size */}
          <div className="flex items-center gap-2 bg-black/60 border border-border/50 rounded-lg px-3 py-1.5">
            <Type className="h-4 w-4 text-white/50" />
            <select
              value={fontSize}
              onChange={(e) => setFontSize(e.target.value as typeof fontSize)}
              className="bg-transparent border-none text-sm text-white focus:outline-none cursor-pointer"
            >
              <option value="sm" className="bg-black">Small</option>
              <option value="base" className="bg-black">Normal</option>
              <option value="lg" className="bg-black">Large</option>
              <option value="xl" className="bg-black">Extra Large</option>
            </select>
          </div>
          
          {/* Line Height */}
          <div className="flex items-center gap-2 bg-black/60 border border-border/50 rounded-lg px-3 py-1.5">
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

      {/* Main Content Area with Sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Chapter Navigation */}
        <div className="w-64 flex-shrink-0 border-r border-border/60 bg-black/30 overflow-y-auto">
          <div className="p-4">
            <h3 className="text-sm font-semibold text-white/80 mb-3 uppercase tracking-wider">Chapters</h3>
            <nav className="space-y-1">
              {flatSections.map((section, index) => {
                const pageCount = calculatePageCount(section);
                return (
                  <button
                    key={section.id || index}
                    onClick={() => goToSection(index)}
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

        {/* Book Content - Larger reading area */}
        <div className="flex-1 overflow-x-hidden">
          <div className="max-w-7xl mx-auto px-16 py-32">
          {/* Section Title */}
          {currentSection && (
            <div className="mb-12">
              <h2 className="text-6xl font-bold text-white mb-8 border-b border-primary/30 pb-8">
                {currentSection.title}
              </h2>
              {currentSection.period && (
                <p className="text-sm text-white/50 italic">
                  {new Date(currentSection.period.from).toLocaleDateString()} - {currentSection.period.to ? new Date(currentSection.period.to).toLocaleDateString() : 'Present'}
                </p>
              )}
            </div>
          )}

          {/* Section Content */}
          {currentSection && (
            <div 
              className={`prose prose-invert max-w-none ${fontSizeClasses[fontSize]} ${lineHeightClasses[lineHeight]}`}
              style={{
                color: 'rgba(255, 255, 255, 0.9)',
                fontFamily: 'Georgia, serif'
              }}
            >
              <div 
                className="whitespace-pre-wrap"
                style={{
                  fontSize: fontSize === 'sm' ? '1rem' : fontSize === 'base' ? '1.25rem' : fontSize === 'lg' ? '1.5rem' : '1.75rem',
                  lineHeight: lineHeight === 'normal' ? 1.7 : lineHeight === 'relaxed' ? 2 : 2.3,
                  textAlign: 'justify',
                  textJustify: 'inter-word',
                  maxWidth: '100%'
                }}
              >
                {currentSection.content || (
                  <span className="text-white/40 italic">This section is empty. Start writing to fill it with your story.</span>
                )}
              </div>
            </div>
          )}
          </div>
        </div>
      </div>

      {/* Navigation Footer */}
      <div className="border-t border-border/60 bg-black/40 backdrop-blur-sm px-8 py-4 flex items-center justify-between flex-shrink-0">
        <Button
          variant="outline"
          size="sm"
          onClick={goToPrevious}
          disabled={currentSectionIndex === 0}
          leftIcon={<ChevronLeft className="h-4 w-4" />}
          aria-label="Previous section"
        >
          Previous
        </Button>

        <div className="flex items-center gap-2 px-4 py-2 bg-black/60 rounded-full border border-border/30 overflow-x-auto max-w-[60%]">
          {flatSections.map((section, index) => (
            <button
              key={index}
              onClick={() => goToSection(index)}
              className={`rounded-full transition-all flex-shrink-0 ${
                index === currentSectionIndex
                  ? 'bg-primary w-8 h-2'
                  : 'bg-white/20 hover:bg-white/40 w-2 h-2'
              }`}
              title={section?.title}
              aria-label={`Go to section: ${section?.title}`}
            />
          ))}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={goToNext}
          disabled={currentSectionIndex === totalSections - 1}
          rightIcon={<ChevronRight className="h-4 w-4" />}
          aria-label="Next section"
        >
          Next
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

