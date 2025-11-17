import { useState, useEffect, useRef } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, BookMarked, Loader2, MessageSquare, ChevronUp, ChevronDown, Type, AlignJustify } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { ColorCodedTimeline } from '../timeline/ColorCodedTimeline';
import { ChatFirstInterface } from '../chat/ChatFirstInterface';
import { fetchJson } from '../../lib/api';

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


export const LoreBook = () => {
  const [outline, setOutline] = useState<MemoirOutline | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [fontSize, setFontSize] = useState<'sm' | 'base' | 'lg' | 'xl'>('base');
  const [lineHeight, setLineHeight] = useState<'normal' | 'relaxed' | 'loose'>('relaxed');
  const [showChat, setShowChat] = useState(false);

  useEffect(() => {
    loadMemoir();
    loadChapters();
  }, []);

  const loadMemoir = async () => {
    try {
      setLoading(true);
      const data = await fetchJson<MemoirOutline>('/api/memoir/outline');
      setOutline(data);
      // Flatten sections for reading
      const flatSections = flattenSections(data.sections);
      if (flatSections.length > 0) {
        setCurrentSectionIndex(0);
      }
    } catch (error) {
      console.error('Failed to load memoir:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadChapters = async () => {
    try {
      const data = await fetchJson<{ chapters: Chapter[] }>('/api/chapters');
      setChapters(data.chapters || []);
    } catch (error) {
      console.error('Failed to load chapters:', error);
    }
  };

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-12rem)]">
        <div className="text-center">
          <Loader2 className="h-12 w-12 mx-auto mb-4 text-primary animate-spin" />
          <p className="text-white/60">Loading your book...</p>
        </div>
      </div>
    );
  }

  if (!outline || flatSections.length === 0) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-12rem)]">
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

  return (
    <div className="h-[calc(100vh-12rem)] flex flex-col bg-gradient-to-br from-black via-purple-950/20 to-black">
      {/* Header */}
      <div className="border-b border-border/60 bg-black/40 backdrop-blur-sm px-6 py-4 flex items-center justify-between flex-shrink-0">
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

      {/* Book Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-8 py-12">
          {/* Section Title */}
          {currentSection && (
            <div className="mb-8">
              <h2 className="text-4xl font-bold text-white mb-4 border-b border-primary/30 pb-4">
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
                  fontSize: fontSize === 'sm' ? '0.875rem' : fontSize === 'base' ? '1rem' : fontSize === 'lg' ? '1.125rem' : '1.25rem',
                  lineHeight: lineHeight === 'normal' ? 1.5 : lineHeight === 'relaxed' ? 1.75 : 2,
                  textAlign: 'justify',
                  textJustify: 'inter-word'
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

      {/* Horizontal Timeline */}
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

      {/* Ask Lore Keeper Chat Interface */}
      <div className="border-t border-border/60 bg-black/60 backdrop-blur-sm flex-shrink-0">
        <Button
          variant="ghost"
          onClick={() => setShowChat(!showChat)}
          className="w-full px-6 py-3 flex items-center justify-between hover:bg-black/40 transition rounded-none border-none"
          aria-label={showChat ? 'Hide chat' : 'Show chat'}
        >
          <div className="flex items-center gap-3">
            <MessageSquare className="h-5 w-5 text-primary" />
            <span className="text-white font-medium">Ask Lore Keeper</span>
            <span className="text-xs text-white/50 hidden sm:inline">Get insights about your story</span>
          </div>
          {showChat ? (
            <ChevronDown className="h-5 w-5 text-white/50" />
          ) : (
            <ChevronUp className="h-5 w-5 text-white/50" />
          )}
        </Button>
        
        {showChat && (
          <div className="border-t border-border/40 h-[400px] max-h-[50vh] flex flex-col overflow-hidden bg-black/40">
            <ChatFirstInterface />
          </div>
        )}
      </div>

      {/* Navigation Footer */}
      <div className="border-t border-border/60 bg-black/40 backdrop-blur-sm px-6 py-4 flex items-center justify-between flex-shrink-0">
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

        <div className="flex items-center gap-2 px-4 py-2 bg-black/60 rounded-full border border-border/30">
          {flatSections.map((section, index) => (
            <button
              key={index}
              onClick={() => goToSection(index)}
              className={`rounded-full transition-all ${
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
    </div>
  );
};

