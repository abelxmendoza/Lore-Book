import type { ChronologyEntry, Timeline, TimePrecision } from '../types/timelineV2';

/**
 * Generate realistic mock timeline data for UI development
 */
export const generateMockTimelines = (): Timeline[] => {
  const now = new Date();
  const twoYearsAgo = new Date(now);
  twoYearsAgo.setFullYear(now.getFullYear() - 2);

  const timelines: Timeline[] = [
    // Fitness Transformation Timeline
    {
      id: 'timeline-fitness-1',
      user_id: 'mock-user',
      title: 'Fitness Transformation',
      description: 'My complete health and fitness journey - from starting to where I am now',
      timeline_type: 'custom',
      parent_id: null,
      start_date: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString(),
      end_date: null,
      tags: ['fitness', 'health', 'wellness', 'transformation', 'gym', 'workout'],
      metadata: {},
      created_at: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: now.toISOString(),
      children: []
    },
    // Web Development Journey Timeline
    {
      id: 'timeline-webdev-1',
      user_id: 'mock-user',
      title: 'Web Development Journey',
      description: 'Learning and mastering web technologies, from basics to advanced frameworks',
      timeline_type: 'skill',
      parent_id: null,
      start_date: new Date(twoYearsAgo.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString(),
      end_date: null,
      tags: ['coding', 'javascript', 'react', 'web-development', 'programming'],
      metadata: {},
      created_at: twoYearsAgo.toISOString(),
      updated_at: now.toISOString(),
      children: []
    },
    // Life Era Timeline
    {
      id: 'timeline-life-era-1',
      user_id: 'mock-user',
      title: 'Early Career Years',
      description: 'The foundational years of my professional journey',
      timeline_type: 'life_era',
      parent_id: null,
      start_date: twoYearsAgo.toISOString(),
      end_date: null, // Ongoing
      tags: ['career', 'growth', 'learning'],
      metadata: {},
      created_at: twoYearsAgo.toISOString(),
      updated_at: now.toISOString(),
      children: [
        {
          id: 'timeline-sub-1',
          user_id: 'mock-user',
          title: 'First Job',
          description: 'My first professional role',
          timeline_type: 'work',
          parent_id: 'timeline-life-era-1',
          start_date: new Date(twoYearsAgo.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          end_date: new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString(),
          tags: ['work', 'first-job'],
          metadata: {},
          created_at: twoYearsAgo.toISOString(),
          updated_at: now.toISOString(),
          children: []
        },
        {
          id: 'timeline-sub-2',
          user_id: 'mock-user',
          title: 'Current Role',
          description: 'My current position',
          timeline_type: 'work',
          parent_id: 'timeline-life-era-1',
          start_date: new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString(),
          end_date: null,
          tags: ['work', 'current'],
          metadata: {},
          created_at: twoYearsAgo.toISOString(),
          updated_at: now.toISOString(),
          children: []
        }
      ]
    },
    // Location Timeline
    {
      id: 'timeline-location-1',
      user_id: 'mock-user',
      title: 'San Francisco Chapter',
      description: 'Time spent living and working in SF',
      timeline_type: 'location',
      parent_id: null,
      start_date: new Date(twoYearsAgo.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      end_date: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString(),
      tags: ['san-francisco', 'relocation'],
      metadata: {},
      created_at: twoYearsAgo.toISOString(),
      updated_at: now.toISOString(),
      children: []
    },
    // Additional Skill Timelines
    {
      id: 'timeline-skill-2',
      user_id: 'mock-user',
      title: 'Machine Learning Exploration',
      description: 'Diving deep into AI and machine learning concepts',
      timeline_type: 'skill',
      parent_id: null,
      start_date: new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString(),
      end_date: null,
      tags: ['ai', 'machine-learning', 'python', 'data-science'],
      metadata: {},
      created_at: new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: now.toISOString(),
      children: []
    },
    {
      id: 'timeline-skill-3',
      user_id: 'mock-user',
      title: 'Music Production Journey',
      description: 'Learning music production and sound design',
      timeline_type: 'skill',
      parent_id: null,
      start_date: new Date(now.getTime() - 240 * 24 * 60 * 60 * 1000).toISOString(),
      end_date: null,
      tags: ['music', 'production', 'audio', 'creative'],
      metadata: {},
      created_at: new Date(now.getTime() - 240 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: now.toISOString(),
      children: []
    },
    // Additional Custom Timelines
    {
      id: 'timeline-custom-2',
      user_id: 'mock-user',
      title: 'Meditation Practice',
      description: 'My journey into mindfulness and meditation',
      timeline_type: 'custom',
      parent_id: null,
      start_date: new Date(now.getTime() - 200 * 24 * 60 * 60 * 1000).toISOString(),
      end_date: null,
      tags: ['meditation', 'mindfulness', 'wellness', 'mental-health'],
      metadata: {},
      created_at: new Date(now.getTime() - 200 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: now.toISOString(),
      children: []
    },
    {
      id: 'timeline-custom-3',
      user_id: 'mock-user',
      title: 'Photography Adventures',
      description: 'Exploring the world through photography',
      timeline_type: 'custom',
      parent_id: null,
      start_date: new Date(twoYearsAgo.getTime() + 120 * 24 * 60 * 60 * 1000).toISOString(),
      end_date: null,
      tags: ['photography', 'travel', 'creative', 'art'],
      metadata: {},
      created_at: new Date(twoYearsAgo.getTime() + 120 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: now.toISOString(),
      children: []
    }
  ];

  return timelines;
};

/**
 * Generate realistic mock chronology entries
 */
export const generateMockChronologyEntries = (timelines: Timeline[]): ChronologyEntry[] => {
  const now = new Date();
  const entries: ChronologyEntry[] = [];
  
  // Timeline-specific memory templates
  const timelineMemoryTemplates: Record<string, Array<{ content: string; precision: TimePrecision; isRange: boolean; durationDays?: number }>> = {
    'timeline-fitness-1': [
      { content: 'Started my fitness transformation journey. Set a goal to work out 4 times a week and track my progress.', precision: 'day', isRange: false },
      { content: 'Completed my first week of consistent workouts. Feeling stronger already and more energized throughout the day.', precision: 'day', isRange: false },
      { content: 'Hit a new personal record on deadlifts today. 225lbs! The hard work is paying off.', precision: 'day', isRange: false },
      { content: 'Started meal prepping to support my fitness goals. Eating cleaner and feeling better.', precision: 'day', isRange: false },
      { content: 'Lost 10 pounds in the first month. More importantly, I feel healthier and more confident.', precision: 'month', isRange: true, durationDays: 30 },
      { content: 'Joined a local gym and found a workout buddy. Having someone to train with makes it so much better.', precision: 'day', isRange: false },
      { content: 'Completed a 5K run without stopping. Never thought I could do that when I started.', precision: 'day', isRange: false },
      { content: 'Started doing yoga to improve flexibility and recovery. It\'s become a crucial part of my routine.', precision: 'day', isRange: false },
      { content: 'Hit my goal weight! But more than that, I\'ve built sustainable habits that I can maintain.', precision: 'day', isRange: false },
      { content: 'Signed up for my first half marathon. Training starts next week - excited and nervous!', precision: 'day', isRange: false }
    ],
    'timeline-webdev-1': [
      { content: 'Started learning web development. Began with HTML and CSS basics. Everything is new and exciting!', precision: 'day', isRange: false },
      { content: 'Built my first website - a simple portfolio page. It\'s not perfect but it\'s mine and I\'m proud of it.', precision: 'day', isRange: false },
      { content: 'Dove into JavaScript. The concepts are challenging but I\'m starting to see how powerful it is.', precision: 'day', isRange: false },
      { content: 'Completed my first React tutorial. Components, props, state - it\'s all starting to click.', precision: 'day', isRange: false },
      { content: 'Built my first full-stack application - a todo app with authentication. Deployed it to production!', precision: 'day', isRange: false },
      { content: 'Started contributing to open source projects. Learning so much from reading other people\'s code.', precision: 'day', isRange: false },
      { content: 'Finished an advanced React course. Hooks, context, performance optimization - feeling more confident now.', precision: 'day', isRange: false },
      { content: 'Got my first freelance web development project. Building a website for a local business.', precision: 'day', isRange: false },
      { content: 'Learned TypeScript. The type safety is a game-changer for larger projects.', precision: 'day', isRange: false },
      { content: 'Built a complex dashboard application with real-time updates. Used React, Node.js, and WebSockets.', precision: 'day', isRange: false }
    ],
    'timeline-life-era-1': [
      { content: 'Had an amazing breakthrough at work today. Finally solved that complex problem I\'ve been wrestling with for weeks.', precision: 'day', isRange: false },
      { content: 'Started a new project that combines my passion for design and technology. Excited to see where this leads.', precision: 'day', isRange: false },
      { content: 'Had a deep conversation with a mentor about career growth. Gained valuable insights about long-term planning.', precision: 'day', isRange: false }
    ],
    'timeline-location-1': [
      { content: 'Moved to San Francisco. The city is vibrant and full of opportunities. Excited for this new chapter.', precision: 'day', isRange: false },
      { content: 'Explored Golden Gate Park for the first time. Beautiful place to unwind after work.', precision: 'day', isRange: false },
      { content: 'Found my favorite coffee shop in the Mission District. It\'s become my go-to spot for weekend work sessions.', precision: 'day', isRange: false }
    ],
    'timeline-skill-2': [
      { content: 'Started learning machine learning. Began with linear regression and basic concepts.', precision: 'day', isRange: false },
      { content: 'Built my first neural network from scratch. Understanding backpropagation was a breakthrough moment.', precision: 'day', isRange: false },
      { content: 'Completed a Kaggle competition. Learned so much about feature engineering and model tuning.', precision: 'day', isRange: false }
    ],
    'timeline-skill-3': [
      { content: 'Got my first MIDI controller. Starting to learn music production and it\'s incredibly fun.', precision: 'day', isRange: false },
      { content: 'Finished my first track. It\'s rough but I\'m proud of it. Music production is harder than I thought!', precision: 'day', isRange: false },
      { content: 'Learned about sound design and synthesis. Creating sounds from scratch is like magic.', precision: 'day', isRange: false }
    ],
    'timeline-custom-2': [
      { content: 'Started a daily meditation practice. Just 10 minutes a day but already noticing a difference in my stress levels.', precision: 'day', isRange: false },
      { content: 'Completed a 30-day meditation challenge. My focus and emotional regulation have improved significantly.', precision: 'month', isRange: true, durationDays: 30 },
      { content: 'Attended a mindfulness retreat. Deepened my practice and met amazing people on similar journeys.', precision: 'day', isRange: false }
    ],
    'timeline-custom-3': [
      { content: 'Got my first DSLR camera. Starting to learn photography basics - composition, lighting, exposure.', precision: 'day', isRange: false },
      { content: 'Took my camera on a weekend trip to the mountains. Captured some stunning landscape shots.', precision: 'day', isRange: false },
      { content: 'Started a photography Instagram account. Sharing my work and connecting with other photographers.', precision: 'day', isRange: false }
    ]
  };

  const memoryTemplates = [
    {
      content: 'Had an amazing breakthrough at work today. Finally solved that complex problem I\'ve been wrestling with for weeks.',
      precision: 'day' as TimePrecision,
      isRange: false
    },
    {
      content: 'Started a new project that combines my passion for design and technology. Excited to see where this leads.',
      precision: 'day' as TimePrecision,
      isRange: false
    },
    {
      content: 'Attended an incredible conference on machine learning. Met some fascinating people and learned about cutting-edge research.',
      precision: 'day' as TimePrecision,
      isRange: false
    },
    {
      content: 'Completed a major milestone in my learning journey. Finished the advanced React course and built my first production app.',
      precision: 'day' as TimePrecision,
      isRange: false
    },
    {
      content: 'Moved to a new apartment in the city. The neighborhood is vibrant and full of life. Looking forward to exploring.',
      precision: 'day' as TimePrecision,
      isRange: false
    },
    {
      content: 'Had a deep conversation with a mentor about career growth. Gained valuable insights about long-term planning.',
      precision: 'day' as TimePrecision,
      isRange: false
    },
    {
      content: 'Started a new fitness routine. Committed to running three times a week and tracking my progress.',
      precision: 'day' as TimePrecision,
      isRange: false
    },
    {
      content: 'Went on a weekend trip to the mountains. The scenery was breathtaking and it was exactly what I needed to recharge.',
      precision: 'day' as TimePrecision,
      isRange: false
    },
    {
      content: 'Published my first technical blog post. It was nerve-wracking but the feedback has been overwhelmingly positive.',
      precision: 'day' as TimePrecision,
      isRange: false
    },
    {
      content: 'Joined a local coding meetup. Great community of developers sharing knowledge and building together.',
      precision: 'day' as TimePrecision,
      isRange: false
    },
    {
      content: 'Completed a month-long project that pushed my boundaries. Learned so much about system design and architecture.',
      precision: 'month' as TimePrecision,
      isRange: true,
      durationDays: 30
    },
    {
      content: 'Took a sabbatical to travel and explore different cultures. Visited three countries and had life-changing experiences.',
      precision: 'month' as TimePrecision,
      isRange: true,
      durationDays: 90
    },
    {
      content: 'Participated in a hackathon with friends. We built a prototype in 48 hours and won second place!',
      precision: 'day' as TimePrecision,
      isRange: true,
      durationDays: 2
    },
    {
      content: 'Started learning a new programming language. The syntax is different but the concepts are familiar.',
      precision: 'day' as TimePrecision,
      isRange: false
    },
    {
      content: 'Had a breakthrough moment in understanding a complex algorithm. Everything clicked after weeks of study.',
      precision: 'day' as TimePrecision,
      isRange: false
    },
    {
      content: 'Organized a team-building event for my colleagues. It was great to see everyone connect outside of work.',
      precision: 'day' as TimePrecision,
      isRange: false
    },
    {
      content: 'Read an inspiring book about productivity and time management. Already implementing some of the strategies.',
      precision: 'day' as TimePrecision,
      isRange: false
    },
    {
      content: 'Attended a workshop on public speaking. Overcame my fear and delivered a presentation to a large audience.',
      precision: 'day' as TimePrecision,
      isRange: false
    },
    {
      content: 'Started volunteering at a local non-profit. Using my skills to make a positive impact in the community.',
      precision: 'day' as TimePrecision,
      isRange: false
    },
    {
      content: 'Completed a challenging certification exam. Months of preparation finally paid off.',
      precision: 'day' as TimePrecision,
      isRange: false
    }
  ];

  // Generate entries over the past 2 years
  const startDate = new Date(now);
  startDate.setFullYear(now.getFullYear() - 2);

  const timelineIds = timelines.length > 0 ? timelines.map(t => t.id) : [];
  
  // First, generate timeline-specific memories
  Object.entries(timelineMemoryTemplates).forEach(([timelineId, templates]) => {
    templates.forEach((template, index) => {
      // Spread entries over the timeline's duration
      const timeline = timelines.find(t => t.id === timelineId);
      if (!timeline) return;
      
      const timelineStart = new Date(timeline.start_date);
      const timelineEnd = timeline.end_date ? new Date(timeline.end_date) : now;
      const timelineDuration = timelineEnd.getTime() - timelineStart.getTime();
      const entryOffset = (index / templates.length) * timelineDuration;
      const entryDate = new Date(timelineStart.getTime() + entryOffset);
      
      const startTime = new Date(entryDate);
      let endTime: Date | null = null;
      
      if (template.isRange && template.durationDays) {
        endTime = new Date(startTime);
        endTime.setDate(endTime.getDate() + template.durationDays);
      }

      const entry: ChronologyEntry = {
        id: `mock-entry-${timelineId}-${index}`,
        user_id: 'mock-user',
        journal_entry_id: `mock-journal-${timelineId}-${index}`,
        start_time: startTime.toISOString(),
        end_time: endTime ? endTime.toISOString() : null,
        time_precision: template.precision,
        time_confidence: 0.8 + Math.random() * 0.2,
        content: template.content,
        timeline_memberships: [timelineId],
        timeline_names: [timeline.title]
      };

      entries.push(entry);
    });
  });
  
  // Then, distribute generic entries across time and timelines
  memoryTemplates.forEach((template, index) => {
    // Spread entries over time (more recent entries more frequently)
    const daysOffset = Math.floor((index * 25) + Math.random() * 15);
    const currentDate = new Date(startDate);
    currentDate.setDate(currentDate.getDate() + daysOffset);
    
    // Assign to a random timeline (or leave ungrouped occasionally)
    // Make sure we have timelines before assigning
    const timelineMemberships = timelineIds.length > 0 && Math.random() > 0.2 
      ? [timelineIds[Math.floor(Math.random() * timelineIds.length)]]
      : [];
    
    const startTime = new Date(currentDate);
    let endTime: Date | null = null;
    
    if (template.isRange && template.durationDays) {
      endTime = new Date(startTime);
      endTime.setDate(endTime.getDate() + template.durationDays);
    }

    const entry: ChronologyEntry = {
      id: `mock-entry-generic-${index}`,
      user_id: 'mock-user',
      journal_entry_id: `mock-journal-generic-${index}`,
      start_time: startTime.toISOString(),
      end_time: endTime ? endTime.toISOString() : null,
      time_precision: template.precision,
      time_confidence: 0.8 + Math.random() * 0.2, // 0.8 to 1.0
      content: template.content,
      timeline_memberships: timelineMemberships,
      timeline_names: timelineMemberships.length > 0 ? timelineMemberships.map(id => {
        const timeline = timelines.find(t => t.id === id);
        return timeline?.title || 'Unknown Timeline';
      }) : []
    };

    entries.push(entry);
  });

  // Add some recent entries (last 30 days)
  for (let i = 0; i < 8; i++) {
    const daysAgo = Math.floor(Math.random() * 30);
    const entryDate = new Date(now);
    entryDate.setDate(entryDate.getDate() - daysAgo);
    
    const recentTemplates = [
      'Had a productive day working on side projects.',
      'Met up with friends for coffee and great conversation.',
      'Learned something new about TypeScript generics.',
      'Went for a long walk and cleared my mind.',
      'Finished reading an interesting article about AI.',
      'Had a video call with a mentor discussing career goals.',
      'Spent time organizing my workspace for better productivity.',
      'Explored a new neighborhood and discovered a great cafe.'
    ];

    const timelineMemberships = timelineIds.length > 0 && Math.random() > 0.3
      ? [timelineIds[Math.floor(Math.random() * timelineIds.length)]]
      : [];

    entries.push({
      id: `mock-entry-recent-${i}`,
      user_id: 'mock-user',
      journal_entry_id: `mock-journal-recent-${i}`,
      start_time: entryDate.toISOString(),
      end_time: null,
      time_precision: 'day',
      time_confidence: 0.9 + Math.random() * 0.1,
      content: recentTemplates[i % recentTemplates.length],
      timeline_memberships: timelineMemberships,
      timeline_names: timelineMemberships.length > 0 ? timelineMemberships.map(id => {
        const timeline = timelines.find(t => t.id === id);
        return timeline?.title || 'Unknown Timeline';
      }) : []
    });
  }

  // Sort by start_time
  entries.sort((a, b) => 
    new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  );

  return entries;
};
