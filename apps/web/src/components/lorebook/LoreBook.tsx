import { useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, BookMarked, MessageSquare, ChevronUp, ChevronDown, Type, AlignJustify } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { ColorCodedTimeline } from '../timeline/ColorCodedTimeline';
import { ChatFirstInterface } from '../chat/ChatFirstInterface';

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
  // Use dummy data for demonstration (read-only mode)
  const [outline] = useState<MemoirOutline>(dummyBook);
  const [chapters] = useState<Chapter[]>(dummyChapters);
  const [loading] = useState(false);
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [fontSize, setFontSize] = useState<'sm' | 'base' | 'lg' | 'xl'>('base');
  const [lineHeight, setLineHeight] = useState<'normal' | 'relaxed' | 'loose'>('relaxed');
  const [showChat, setShowChat] = useState(false); // Hidden by default for reading focus

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

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col bg-gradient-to-br from-black via-purple-950/20 to-black">
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
    </div>
  );
};

