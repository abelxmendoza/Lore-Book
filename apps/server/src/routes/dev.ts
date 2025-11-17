import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { addDays, addMonths, addYears, subDays, subMonths, subYears } from 'date-fns';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { chapterService } from '../services/chapterService';
import { memoryService } from '../services/memoryService';
import { memoirService } from '../services/memoirService';
import { peoplePlacesService } from '../services/peoplePlacesService';
import { taskEngineService } from '../services/taskEngineService';
import { supabaseAdmin } from '../services/supabaseClient';
import { logger } from '../logger';
import { timeEngine } from '../services/timeEngine';

const router = Router();

// Comprehensive dummy data showcasing all features
const now = new Date();

const dummyChapters = [
  {
    title: 'The Beginning: Finding My Path',
    startDate: subYears(now, 2).toISOString(),
    endDate: subMonths(now, 18).toISOString(),
    description: 'A period of exploration and self-discovery, learning what truly matters.'
  },
  {
    title: 'Building Momentum: Growth and Challenges',
    startDate: subMonths(now, 18).toISOString(),
    endDate: subMonths(now, 6).toISOString(),
    description: 'Facing challenges head-on and building the foundation for future success.'
  },
  {
    title: 'Current Chapter: Transformation',
    startDate: subMonths(now, 6).toISOString(),
    endDate: null,
    description: 'The ongoing journey of transformation and continuous improvement.'
  }
];

const dummyCharacters = [
  {
    name: 'Sarah Chen',
    type: 'person' as const,
    role: 'Best Friend',
    summary: 'A close friend who always provides honest feedback and support. We met in college and have been inseparable ever since.',
    tags: ['friendship', 'support', 'honesty']
  },
  {
    name: 'Marcus Johnson',
    type: 'person' as const,
    role: 'Mentor',
    summary: 'A wise mentor who has guided me through many career decisions. His insights are always valuable.',
    tags: ['mentorship', 'career', 'wisdom']
  },
  {
    name: 'Alex Rivera',
    type: 'person' as const,
    role: 'Collaborator',
    summary: 'A creative collaborator on various projects. We work well together and push each other to excel.',
    tags: ['collaboration', 'creativity', 'professional']
  },
  {
    name: 'The Coffee Shop',
    type: 'place' as const,
    role: 'Workspace',
    summary: 'My favorite place to work and think. The atmosphere is perfect for creativity.',
    tags: ['workspace', 'creativity', 'routine']
  },
  {
    name: 'Central Park',
    type: 'place' as const,
    role: 'Reflection Space',
    summary: 'A peaceful place for walks and reflection. I come here when I need to clear my mind.',
    tags: ['nature', 'peace', 'reflection']
  }
];

// Rich entries showcasing time engine features
const dummyEntries = [
  // Recent entries (last week)
  {
    content: "Just had an amazing conversation with Sarah about our future plans. We discussed starting a creative project together. The energy was incredible - this feels like the beginning of something special.",
    tags: ['friendship', 'creativity', 'collaboration', 'excitement'],
    mood: 'excited',
    date: subDays(now, 1).toISOString(),
    summary: 'Planning a creative project with Sarah',
    relationships: [{ name: 'Sarah Chen', tag: 'friend' as const }]
  },
  {
    content: "Finished reading 'The Creative Process' by Marcus's recommendation. The book challenged everything I thought I knew about creativity. Key insight: creativity isn't about inspiration, it's about showing up consistently.",
    tags: ['reading', 'creativity', 'learning', 'insight'],
    mood: 'thoughtful',
    date: subDays(now, 2).toISOString(),
    summary: 'Finished reading about creativity',
    relationships: [{ name: 'Marcus Johnson', tag: 'coach' as const }]
  },
  {
    content: "Spent the afternoon at The Coffee Shop working on my novel. Wrote 2,000 words - a personal best! The environment there really helps me focus. Met Alex there and we discussed our respective projects.",
    tags: ['writing', 'creativity', 'achievement', 'focus'],
    mood: 'accomplished',
    date: subDays(now, 3).toISOString(),
    summary: 'Productive writing session at coffee shop',
    relationships: [
      { name: 'The Coffee Shop', tag: 'other' as const },
      { name: 'Alex Rivera', tag: 'professional' as const }
    ]
  },
  {
    content: "Went for a long walk in Central Park today. The autumn colors are stunning. Had a breakthrough moment about my career direction while walking. Sometimes the best thinking happens when you're moving.",
    tags: ['nature', 'reflection', 'career', 'breakthrough'],
    mood: 'peaceful',
    date: subDays(now, 4).toISOString(),
    summary: 'Breakthrough moment during park walk',
    relationships: [{ name: 'Central Park', tag: 'other' as const }]
  },
  {
    content: "Attended a workshop on 'Building Creative Habits' with Marcus. Learned about the importance of daily practice and consistency. The other attendees were inspiring - met several people working on interesting projects.",
    tags: ['workshop', 'learning', 'habits', 'networking'],
    mood: 'inspired',
    date: subDays(now, 5).toISOString(),
    summary: 'Workshop on creative habits',
    relationships: [{ name: 'Marcus Johnson', tag: 'coach' as const }]
  },
  {
    content: "Had dinner with Sarah and Alex. We talked about our goals for the next year. It's amazing how aligned we all are - we're all focused on creative growth and meaningful work. This friendship circle is everything.",
    tags: ['friendship', 'goals', 'connection', 'gratitude'],
    mood: 'grateful',
    date: subDays(now, 6).toISOString(),
    summary: 'Dinner with friends discussing goals',
    relationships: [
      { name: 'Sarah Chen', tag: 'friend' as const },
      { name: 'Alex Rivera', tag: 'professional' as const }
    ]
  },
  {
    content: "Started a new morning routine: meditation, journaling, then creative work. It's only been a week but I can already feel the difference. My focus is sharper and my energy is more consistent throughout the day.",
    tags: ['routine', 'mindfulness', 'productivity', 'growth'],
    mood: 'focused',
    date: subDays(now, 7).toISOString(),
    summary: 'New morning routine showing results',
    relationships: []
  },
  
  // Mid-term entries (last month)
  {
    content: "Completed the first draft of my novel! 80,000 words written over the past six months. It's rough, but it exists. Now comes the hard part: editing and refining. But today, I'm celebrating this milestone.",
    tags: ['writing', 'achievement', 'milestone', 'celebration'],
    mood: 'proud',
    date: subDays(now, 15).toISOString(),
    summary: 'Completed first draft of novel',
    relationships: []
  },
  {
    content: "Had a difficult conversation with Marcus about my career path. He challenged some of my assumptions and made me think deeper about what I really want. These conversations are uncomfortable but necessary for growth.",
    tags: ['mentorship', 'growth', 'challenge', 'reflection'],
    mood: 'thoughtful',
    date: subDays(now, 18).toISOString(),
    summary: 'Challenging career conversation with mentor',
    relationships: [{ name: 'Marcus Johnson', tag: 'coach' as const }]
  },
  {
    content: "Collaborated with Alex on a creative project proposal. Our different perspectives complement each other well. We submitted it today - fingers crossed! The process taught me a lot about collaboration.",
    tags: ['collaboration', 'creativity', 'professional', 'learning'],
    mood: 'optimistic',
    date: subDays(now, 22).toISOString(),
    summary: 'Submitted creative project proposal with Alex',
    relationships: [{ name: 'Alex Rivera', tag: 'professional' as const }]
  },
  {
    content: "Sarah and I started a weekly creative meetup. Every Sunday we get together to work on our respective projects and share progress. It's amazing how accountability helps with consistency.",
    tags: ['friendship', 'creativity', 'accountability', 'routine'],
    mood: 'grateful',
    date: subDays(now, 25).toISOString(),
    summary: 'Started weekly creative meetup with Sarah',
    relationships: [{ name: 'Sarah Chen', tag: 'friend' as const }]
  },
  
  // Older entries (last 3 months)
  {
    content: "Made the decision to pursue writing full-time. It's scary but exciting. I've been preparing for this moment for years. Time to take the leap and trust the process.",
    tags: ['career', 'decision', 'courage', 'transition'],
    mood: 'determined',
    date: subMonths(now, 1).toISOString(),
    summary: 'Decision to pursue writing full-time',
    relationships: []
  },
  {
    content: "Finished my last day at the corporate job. Mixed emotions - grateful for the experience but excited for what's next. My colleagues threw me a surprise party. It was touching.",
    tags: ['transition', 'gratitude', 'career', 'celebration'],
    mood: 'nostalgic',
    date: subMonths(now, 1).toISOString(),
    summary: 'Last day at corporate job',
    relationships: []
  },
  {
    content: "First week as a full-time writer. The freedom is incredible but also overwhelming. Learning to structure my days differently. Marcus gave me great advice about building routines.",
    tags: ['transition', 'writing', 'routine', 'learning'],
    mood: 'overwhelmed',
    date: subMonths(now, 1).toISOString(),
    summary: 'First week as full-time writer',
    relationships: [{ name: 'Marcus Johnson', tag: 'coach' as const }]
  },
  {
    content: "Attended a writing conference. Met so many inspiring authors and learned about the publishing industry. One speaker's talk on 'The Long Game' really resonated with me.",
    tags: ['conference', 'learning', 'networking', 'inspiration'],
    mood: 'inspired',
    date: subMonths(now, 2).toISOString(),
    summary: 'Attended writing conference',
    relationships: []
  },
  {
    content: "Started working with a writing coach recommended by Marcus. First session was eye-opening. She helped me identify patterns in my writing and areas for improvement.",
    tags: ['coaching', 'learning', 'growth', 'writing'],
    mood: 'hopeful',
    date: subMonths(now, 2).toISOString(),
    summary: 'Started working with writing coach',
    relationships: [{ name: 'Marcus Johnson', tag: 'coach' as const }]
  },
  
  // Historical entries (6+ months ago)
  {
    content: "Had a breakthrough moment about my novel's structure. I've been stuck for weeks, but today everything clicked. Sometimes you need to step away and come back with fresh eyes.",
    tags: ['breakthrough', 'writing', 'creativity', 'problem-solving'],
    mood: 'accomplished',
    date: subMonths(now, 6).toISOString(),
    summary: 'Breakthrough on novel structure',
    relationships: []
  },
  {
    content: "Sarah introduced me to Alex at a creative networking event. We hit it off immediately - shared interests in storytelling and creative projects. Looking forward to collaborating.",
    tags: ['networking', 'friendship', 'collaboration', 'connection'],
    mood: 'excited',
    date: subMonths(now, 8).toISOString(),
    summary: 'Met Alex at networking event',
    relationships: [
      { name: 'Sarah Chen', tag: 'friend' as const },
      { name: 'Alex Rivera', tag: 'professional' as const }
    ]
  },
  {
    content: "Started my first serious writing project. It's a novel about transformation and growth. The idea has been brewing for years. Time to put words on the page.",
    tags: ['writing', 'beginning', 'creativity', 'commitment'],
    mood: 'determined',
    date: subMonths(now, 12).toISOString(),
    summary: 'Started first serious writing project',
    relationships: []
  },
  {
    content: "Met Marcus at a mentorship program. His guidance has been invaluable. He's helped me see possibilities I didn't know existed. Grateful for this connection.",
    tags: ['mentorship', 'gratitude', 'growth', 'connection'],
    mood: 'grateful',
    date: subMonths(now, 18).toISOString(),
    summary: 'Met mentor Marcus',
    relationships: [{ name: 'Marcus Johnson', tag: 'coach' as const }]
  },
  {
    content: "Moved to the city and discovered The Coffee Shop. It's become my second home - the perfect place to write and think. The baristas know my order by heart now.",
    tags: ['place', 'routine', 'writing', 'comfort'],
    mood: 'content',
    date: subMonths(now, 20).toISOString(),
    summary: 'Discovered favorite coffee shop',
    relationships: [{ name: 'The Coffee Shop', tag: 'other' as const }]
  },
  {
    content: "First walk in Central Park. The beauty of this place is overwhelming. I can see myself coming here often for reflection and inspiration.",
    tags: ['place', 'nature', 'reflection', 'discovery'],
    mood: 'awe',
    date: subMonths(now, 22).toISOString(),
    summary: 'First visit to Central Park',
    relationships: [{ name: 'Central Park', tag: 'other' as const }]
  },
  {
    content: "Reconnected with Sarah after years apart. It's like no time has passed. Our friendship is as strong as ever. We made plans to meet regularly.",
    tags: ['friendship', 'reconnection', 'gratitude', 'connection'],
    mood: 'joyful',
    date: subMonths(now, 24).toISOString(),
    summary: 'Reconnected with Sarah',
    relationships: [{ name: 'Sarah Chen', tag: 'friend' as const }]
  }
];

const dummyMemoirSections = [
  {
    title: 'The Awakening',
    content: 'This period marked the beginning of my journey toward creative fulfillment. I had spent years in a corporate job, feeling unfulfilled but unsure of what path to take. The decision to pursue writing wasn\'t made overnight - it was the culmination of years of reflection, conversations with mentors like Marcus, and the support of friends like Sarah.',
    period: {
      from: subYears(now, 2).toISOString(),
      to: subMonths(now, 18).toISOString()
    }
  },
  {
    title: 'Building the Foundation',
    content: 'Once I made the decision to pursue writing seriously, everything changed. I started building daily habits, seeking mentorship, and surrounding myself with creative people. This period was challenging - learning to structure my days differently, dealing with uncertainty, but also incredibly rewarding as I saw my skills develop.',
    period: {
      from: subMonths(now, 18).toISOString(),
      to: subMonths(now, 6).toISOString()
    }
  },
  {
    title: 'The Transformation',
    content: 'The past six months have been transformative. I\'ve completed my first novel draft, built meaningful creative collaborations, and found my voice as a writer. The journey continues, but I\'m no longer the person I was two years ago. I\'ve learned that growth comes from consistency, courage, and the support of those who believe in you.',
    period: {
      from: subMonths(now, 6).toISOString(),
      to: now.toISOString()
    }
  }
];

const dummyTasks = [
  {
    title: 'Edit first draft of novel',
    description: 'Go through the 80,000-word draft and refine structure, pacing, and character development',
    dueDate: addDays(now, 30).toISOString(),
    status: 'incomplete' as const,
    tags: ['writing', 'editing', 'novel']
  },
  {
    title: 'Research literary agents',
    description: 'Find and research potential literary agents who represent similar work',
    dueDate: addDays(now, 45).toISOString(),
    status: 'incomplete' as const,
    tags: ['writing', 'publishing', 'research']
  },
  {
    title: 'Continue weekly creative meetup',
    description: 'Maintain the Sunday creative sessions with Sarah',
    dueDate: addDays(now, 7).toISOString(),
    status: 'incomplete' as const,
    tags: ['creativity', 'accountability', 'friendship']
  },
  {
    title: 'Submit project proposal with Alex',
    description: 'Follow up on the creative project proposal we submitted',
    dueDate: addDays(now, 14).toISOString(),
    status: 'incomplete' as const,
    tags: ['collaboration', 'professional', 'project']
  }
];

router.post('/populate-dummy-data', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const results = {
      chapters: 0,
      entries: 0,
      characters: 0,
      memoirSections: 0,
      tasks: 0
    };

    logger.info({ userId }, 'Starting comprehensive dummy data population...');

    // Create chapters first
    logger.info({ userId }, 'Creating dummy chapters...');
    const chapterIds: string[] = [];
    for (const chapterData of dummyChapters) {
      const chapter = await chapterService.createChapter(userId, {
        title: chapterData.title,
        startDate: chapterData.startDate,
        endDate: chapterData.endDate || undefined,
        description: chapterData.description
      });
      chapterIds.push(chapter.id);
      results.chapters++;
    }

    // Create characters/places by creating entries that mention them
    logger.info({ userId }, 'Creating dummy characters and places...');
    const characterEntries: Array<{ content: string; relationships: Array<{ name: string; tag: 'friend' | 'coach' | 'professional' | 'other' }> }> = [];
    
    // Create entries that mention characters to auto-detect them
    for (const charData of dummyCharacters) {
      const entryContent = `Met ${charData.name}${charData.role ? `, ${charData.role}` : ''}. ${charData.summary || ''}`;
      const relationships = charData.type === 'person' 
        ? [{ name: charData.name, tag: (charData.role?.toLowerCase().includes('friend') ? 'friend' : 
                                        charData.role?.toLowerCase().includes('mentor') ? 'coach' : 
                                        'professional') as 'friend' | 'coach' | 'professional' }]
        : [{ name: charData.name, tag: 'other' as const }];
      
      characterEntries.push({ content: entryContent, relationships });
    }
    
    // Create entries to trigger entity detection
    for (const entryData of characterEntries) {
      const entry = await memoryService.saveEntry({
        userId,
        content: entryData.content,
        date: subMonths(now, 24).toISOString(),
        tags: [],
        source: 'manual',
        relationships: entryData.relationships
      });
      await peoplePlacesService.recordEntitiesForEntry(entry, entryData.relationships);
      results.characters++;
    }

    // Create journal entries with proper chapter assignment
    logger.info({ userId }, 'Creating dummy entries...');
    for (const entryData of dummyEntries) {
      // Determine which chapter this entry belongs to based on date
      let chapterId: string | undefined;
      const entryDate = new Date(entryData.date);
      
      if (entryDate >= new Date(subMonths(now, 6))) {
        chapterId = chapterIds[2]; // Current Chapter
      } else if (entryDate >= new Date(subMonths(now, 18))) {
        chapterId = chapterIds[1]; // Building Momentum
      } else {
        chapterId = chapterIds[0]; // The Beginning
      }

      await memoryService.saveEntry({
        userId,
        content: entryData.content,
        date: entryData.date,
        tags: entryData.tags,
        mood: entryData.mood,
        summary: entryData.summary,
        chapterId,
        source: 'manual',
        relationships: entryData.relationships
      });
      results.entries++;
    }

    // Create memoir sections via outline
    logger.info({ userId }, 'Creating dummy memoir sections...');
    const outline = await memoirService.getOutline(userId);
    const sections = dummyMemoirSections.map((section, index) => ({
      id: uuid(),
      title: section.title,
      content: section.content,
      order: index,
      period: section.period,
      lastUpdated: section.period.to || new Date().toISOString()
    }));

    outline.sections = sections;
    outline.title = 'My Life Story';
    outline.metadata = {
      languageStyle: 'reflective and introspective'
    };

    await memoirService.saveOutline(userId, outline);
    results.memoirSections = sections.length;

    // Create tasks
    logger.info({ userId }, 'Creating dummy tasks...');
    for (const taskData of dummyTasks) {
      await taskEngineService.createTask(userId, {
        title: taskData.title,
        description: taskData.description,
        dueDate: taskData.dueDate,
        status: taskData.status,
        metadata: {
          tags: taskData.tags
        }
      });
      results.tasks++;
    }

    logger.info({ userId, results }, 'Dummy data population complete');

    res.json({
      success: true,
      message: `Successfully populated ${results.entries} entries, ${results.chapters} chapters, ${results.characters} characters, ${results.memoirSections} memoir sections, and ${results.tasks} tasks`,
      results
    });
  } catch (error) {
    logger.error({ error }, 'Failed to populate dummy data');
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to populate dummy data'
    });
  }
});

export const devRouter = router;
