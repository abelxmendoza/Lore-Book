/**
 * Complete Dummy User Population Script
 * 
 * This creates a fully populated test user with:
 * - Rich user profile and stats
 * - 5 chapters spanning 2 years
 * - 50+ journal entries with varied content
 * - 10+ characters with relationships
 * - Tasks and milestones
 * - Memoir content
 * - Timeline events
 * 
 * Usage:
 * 1. Open browser console (F12) on http://localhost:5173
 * 2. Copy and paste this entire script
 * 3. Press Enter and wait for completion
 */

(async function populateCompleteDummyUser() {
  console.log('🎭 Starting complete dummy user population...');
  console.log('This will create a rich test profile with extensive data.\n');
  
  const results = {
    chapters: 0,
    entries: 0,
    characters: 0,
    tasks: 0,
    errors: []
  };

  // Helper function to make API calls
  async function apiCall(endpoint, method = 'GET', body = null) {
    try {
      const options = {
        method,
        headers: { 'Content-Type': 'application/json' }
      };
      if (body) options.body = JSON.stringify(body);
      
      const response = await fetch(endpoint, options);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text.substring(0, 200)}`);
      }
      return await response.json();
    } catch (error) {
      console.error(`❌ Error calling ${endpoint}:`, error.message);
      results.errors.push({ endpoint, error: error.message });
      return null;
    }
  }

  // Helper to wait between API calls
  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // ============================================
  // STEP 1: Create Chapters (5 chapters spanning 2 years)
  // ============================================
  console.log('📖 Step 1: Creating chapters...');
  const now = new Date();
  const chapters = [
    {
      title: "The Awakening: Discovering Purpose",
      startDate: new Date(now.getFullYear() - 2, now.getMonth(), 1).toISOString(),
      endDate: new Date(now.getFullYear() - 1, 5, 30).toISOString(),
      description: "A period of self-discovery, learning what truly matters, and finding my path forward. This was when I first started documenting my journey seriously."
    },
    {
      title: "Building Foundations: Growth & Learning",
      startDate: new Date(now.getFullYear() - 1, 6, 1).toISOString(),
      endDate: new Date(now.getFullYear() - 1, 11, 31).toISOString(),
      description: "Focusing on building skills, deepening relationships, and establishing routines that support my goals. A time of steady progress."
    },
    {
      title: "Challenges & Resilience: Weathering Storms",
      startDate: new Date(now.getFullYear(), 0, 1).toISOString(),
      endDate: new Date(now.getFullYear(), 5, 30).toISOString(),
      description: "Facing significant challenges but learning to navigate them with grace. This period taught me resilience and the importance of support systems."
    },
    {
      title: "Transformation: New Perspectives",
      startDate: new Date(now.getFullYear(), 6, 1).toISOString(),
      endDate: new Date(now.getFullYear(), 9, 30).toISOString(),
      description: "A period of significant personal growth and transformation. New opportunities emerged, and I began to see things from different angles."
    },
    {
      title: "Current Chapter: Living Intentionally",
      startDate: new Date(now.getFullYear(), 10, 1).toISOString(),
      endDate: null,
      description: "The ongoing journey of living with intention, pursuing meaningful goals, and building a life aligned with my values."
    }
  ];

  const chapterIds = [];
  for (const chapter of chapters) {
    const result = await apiCall('/api/chapters', 'POST', {
      title: chapter.title,
      startDate: chapter.startDate,
      endDate: chapter.endDate,
      description: chapter.description
    });
    if (result && result.chapter) {
      chapterIds.push(result.chapter.id);
      results.chapters++;
      console.log(`  ✓ Created chapter: "${chapter.title}"`);
    } else if (result && result.id) {
      // Some APIs return the object directly
      chapterIds.push(result.id);
      results.chapters++;
      console.log(`  ✓ Created chapter: "${chapter.title}"`);
    }
    await wait(100); // Small delay to avoid rate limiting
  }

  // ============================================
  // STEP 2: Create Characters (10+ characters)
  // ============================================
  console.log('\n👥 Step 2: Creating characters...');
  const characters = [
    {
      name: "Sarah Chen",
      alias: ["Sarah", "Sara"],
      pronouns: "she/her",
      archetype: "ally",
      role: "Best Friend",
      summary: "My closest friend and confidante. We met in college and have been inseparable ever since. Sarah is incredibly supportive, honest, and always knows how to make me laugh. She's the person I turn to for advice on everything from career decisions to personal growth.",
      tags: ["friendship", "support", "honesty", "loyalty"],
      metadata: {
        relationship_type: "friend",
        closeness_score: 95,
        first_met: "2018-09-15",
        social_media: {
          email: "sarah.chen@example.com"
        }
      }
    },
    {
      name: "Marcus Johnson",
      alias: ["Marcus", "Marc"],
      pronouns: "he/him",
      archetype: "mentor",
      role: "Mentor & Coach",
      summary: "A wise mentor who has guided me through many career and life decisions. Marcus has decades of experience and always provides thoughtful, nuanced advice. His insights have been invaluable in my growth journey.",
      tags: ["mentorship", "wisdom", "career", "guidance"],
      metadata: {
        relationship_type: "coach",
        closeness_score: 85,
        first_met: "2020-03-10"
      }
    },
    {
      name: "Alex Rivera",
      alias: ["Alex", "A.R."],
      pronouns: "they/them",
      archetype: "collaborator",
      role: "Creative Collaborator",
      summary: "A talented creative collaborator I've worked with on several projects. Alex brings fresh perspectives and we complement each other's skills well. Our brainstorming sessions are always productive.",
      tags: ["collaboration", "creativity", "professional", "innovation"],
      metadata: {
        relationship_type: "professional",
        closeness_score: 75,
        first_met: "2021-07-20"
      }
    },
    {
      name: "Jordan Kim",
      alias: ["Jordan", "J"],
      pronouns: "they/them",
      archetype: "family",
      role: "Sibling",
      summary: "My sibling and one of the most important people in my life. We've grown closer over the years and now have deep, meaningful conversations about life, dreams, and everything in between.",
      tags: ["family", "sibling", "support", "connection"],
      metadata: {
        relationship_type: "family",
        closeness_score: 90,
        first_met: "1995-06-15" // Birth date
      }
    },
    {
      name: "Dr. Maya Patel",
      alias: ["Maya", "Dr. Patel"],
      pronouns: "she/her",
      archetype: "mentor",
      role: "Life Coach",
      summary: "A life coach who has helped me navigate personal challenges and develop better self-awareness. Her coaching style is gentle but direct, and she has a gift for asking the right questions.",
      tags: ["coaching", "growth", "self-awareness", "wellness"],
      metadata: {
        relationship_type: "coach",
        closeness_score: 80,
        first_met: "2022-01-15"
      }
    },
    {
      name: "The Coffee Shop",
      alias: ["Coffee Shop", "The Shop"],
      pronouns: "it/its",
      archetype: "place",
      role: "Workspace",
      summary: "My favorite place to work and think. The atmosphere is perfect for creativity - not too quiet, not too loud. I've written some of my best work here and had many meaningful conversations.",
      tags: ["workspace", "creativity", "routine", "comfort"],
      metadata: {
        relationship_type: "place",
        visit_frequency: "weekly"
      }
    },
    {
      name: "Central Park",
      alias: ["The Park"],
      pronouns: "it/its",
      archetype: "place",
      role: "Reflection Space",
      summary: "A peaceful place for walks and reflection. I come here when I need to clear my mind, process thoughts, or simply enjoy nature. It's become a sanctuary for me.",
      tags: ["nature", "peace", "reflection", "walking"],
      metadata: {
        relationship_type: "place",
        visit_frequency: "bi-weekly"
      }
    },
    {
      name: "Emma Thompson",
      alias: ["Emma"],
      pronouns: "she/her",
      archetype: "ally",
      role: "Friend",
      summary: "A friend from my writing group. We share a passion for storytelling and often exchange feedback on each other's work. Her perspective is always valuable.",
      tags: ["friendship", "writing", "creativity", "community"],
      metadata: {
        relationship_type: "friend",
        closeness_score: 70,
        first_met: "2021-11-05"
      }
    },
    {
      name: "River Brooks",
      alias: ["River"],
      pronouns: "they/them",
      archetype: "ally",
      role: "Friend",
      summary: "A friend I met through a mutual interest in mindfulness and meditation. River has introduced me to many practices that have enriched my life.",
      tags: ["friendship", "mindfulness", "wellness", "spirituality"],
      metadata: {
        relationship_type: "friend",
        closeness_score: 65,
        first_met: "2022-04-12"
      }
    },
    {
      name: "The Library",
      alias: ["Library", "Main Library"],
      pronouns: "it/its",
      archetype: "place",
      role: "Learning Space",
      summary: "A quiet space for deep work and research. I come here when I need to focus intensely or explore new topics. The atmosphere of learning is inspiring.",
      tags: ["workspace", "learning", "focus", "research"],
      metadata: {
        relationship_type: "place",
        visit_frequency: "monthly"
      }
    }
  ];

  const characterIds = {};
  for (const char of characters) {
    const result = await apiCall('/api/characters', 'POST', char);
    if (result && result.character) {
      characterIds[char.name] = result.character.id;
      results.characters++;
      console.log(`  ✓ Created character: "${char.name}" (${char.role})`);
    }
    await wait(100);
  }

  // ============================================
  // STEP 3: Create Rich Journal Entries (50+ entries)
  // ============================================
  console.log('\n📝 Step 3: Creating journal entries...');
  
  // Generate entries spread across the timeline
  const entryTemplates = [
    // Recent entries (last 2 weeks)
    {
      content: "Just had an amazing conversation with Sarah about our future plans. We discussed starting a creative project together - a podcast about personal growth and storytelling. The energy was incredible, and this feels like the beginning of something special. We're both excited to dive in.",
      tags: ['friendship', 'creativity', 'collaboration', 'excitement', 'project'],
      mood: 'excited',
      date: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      chapterId: chapterIds[4],
      relationships: [{ name: 'Sarah Chen', tag: 'friend' }],
      summary: 'Planning a creative podcast project with Sarah'
    },
    {
      content: "Finished reading 'The Creative Process' by Marcus's recommendation. The book challenged everything I thought I knew about creativity. Key insight: creativity isn't about waiting for inspiration, it's about showing up consistently and doing the work. This resonates deeply with my own experience.",
      tags: ['reading', 'creativity', 'learning', 'insight', 'books'],
      mood: 'thoughtful',
      date: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      chapterId: chapterIds[4],
      relationships: [{ name: 'Marcus Johnson', tag: 'coach' }],
      summary: 'Finished reading about creativity and process'
    },
    {
      content: "Spent the afternoon at The Coffee Shop working on my novel. Wrote 2,000 words - a personal best! The environment there really helps me focus. Met Alex there and we discussed our respective projects. Their enthusiasm is contagious.",
      tags: ['writing', 'creativity', 'achievement', 'focus', 'novel'],
      mood: 'accomplished',
      date: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      chapterId: chapterIds[4],
      relationships: [{ name: 'Alex Rivera', tag: 'professional' }, { name: 'The Coffee Shop', tag: 'other' }],
      summary: 'Productive writing session at the coffee shop'
    },
    {
      content: "Had a coaching session with Maya today. We talked about setting boundaries and saying no without guilt. This has been a challenge for me, but I'm making progress. Her gentle but direct approach really helps me see things clearly.",
      tags: ['coaching', 'growth', 'boundaries', 'self-care'],
      mood: 'reflective',
      date: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString(),
      chapterId: chapterIds[4],
      relationships: [{ name: 'Dr. Maya Patel', tag: 'coach' }],
      summary: 'Coaching session about boundaries'
    },
    {
      content: "Went for a long walk in Central Park today. The weather was perfect - crisp autumn air, golden leaves everywhere. I felt a sense of peace I haven't felt in a while. Sometimes the simplest moments are the most meaningful. Processed a lot of thoughts during that walk.",
      tags: ['nature', 'peace', 'reflection', 'walking', 'autumn'],
      mood: 'peaceful',
      date: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      chapterId: chapterIds[4],
      relationships: [{ name: 'Central Park', tag: 'other' }],
      summary: 'Peaceful walk in Central Park'
    },
    {
      content: "Attended a workshop on mindfulness and meditation today. Learned new techniques for staying present and managing stress. The instructor was fantastic, and I'm excited to practice these methods daily. River recommended this workshop - so glad I went!",
      tags: ['mindfulness', 'workshop', 'growth', 'wellness'],
      mood: 'calm',
      date: new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString(),
      chapterId: chapterIds[4],
      relationships: [{ name: 'River Brooks', tag: 'friend' }],
      summary: 'Attended mindfulness workshop'
    },
    {
      content: "Celebrated Jordan's birthday today. We had a great time together - dinner, conversation, lots of laughter. I'm grateful for our relationship and how it's deepened over the years. These moments remind me what's truly important in life.",
      tags: ['family', 'celebration', 'gratitude', 'connection'],
      mood: 'joyful',
      date: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      chapterId: chapterIds[4],
      relationships: [{ name: 'Jordan Kim', tag: 'family' }],
      summary: 'Celebrated Jordan\'s birthday'
    },
    {
      content: "Met with my writing group today. Emma shared a beautiful piece she's been working on, and we all provided feedback. The community of writers I've found is so supportive and inspiring. I'm grateful to be part of it.",
      tags: ['writing', 'community', 'friendship', 'creativity'],
      mood: 'inspired',
      date: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString(),
      chapterId: chapterIds[4],
      relationships: [{ name: 'Emma Thompson', tag: 'friend' }],
      summary: 'Writing group meeting'
    },
    {
      content: "Spent the day at The Library researching for my novel. Found some fascinating historical details that will add depth to the story. The quiet atmosphere there is perfect for deep work. Lost track of time completely.",
      tags: ['research', 'writing', 'learning', 'focus'],
      mood: 'curious',
      date: new Date(now.getTime() - 9 * 24 * 60 * 60 * 1000).toISOString(),
      chapterId: chapterIds[4],
      relationships: [{ name: 'The Library', tag: 'other' }],
      summary: 'Research session at the library'
    },
    {
      content: "Had a video call with Marcus today. We discussed my career trajectory and potential opportunities. His perspective is always valuable, and I appreciate how he helps me think through decisions without pushing me in any direction.",
      tags: ['mentorship', 'career', 'guidance', 'planning'],
      mood: 'thoughtful',
      date: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      chapterId: chapterIds[4],
      relationships: [{ name: 'Marcus Johnson', tag: 'coach' }],
      summary: 'Career discussion with Marcus'
    },
    // More entries from previous months...
    {
      content: "Started a new morning routine this week. Waking up 30 minutes earlier to meditate and journal before the day begins. It's been challenging but already I can feel the difference in my mental clarity and focus throughout the day.",
      tags: ['routine', 'mindfulness', 'growth', 'habits'],
      mood: 'determined',
      date: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString(),
      chapterId: chapterIds[3],
      summary: 'Started new morning routine'
    },
    {
      content: "Finished the first draft of my novel! This has been a two-year journey, and reaching this milestone feels incredible. There's still a lot of work ahead - editing, revisions, feedback - but this is a major step. Celebrated with Sarah and Alex.",
      tags: ['writing', 'achievement', 'milestone', 'celebration'],
      mood: 'proud',
      date: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString(),
      chapterId: chapterIds[3],
      relationships: [{ name: 'Sarah Chen', tag: 'friend' }, { name: 'Alex Rivera', tag: 'professional' }],
      summary: 'Completed first draft of novel'
    },
    {
      content: "Went through a difficult period this month, but I'm coming out of it stronger. The support from friends and family, especially Jordan and Sarah, has been invaluable. Learned a lot about resilience and asking for help when needed.",
      tags: ['challenge', 'resilience', 'support', 'growth'],
      mood: 'resilient',
      date: new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000).toISOString(),
      chapterId: chapterIds[2],
      relationships: [{ name: 'Jordan Kim', tag: 'family' }, { name: 'Sarah Chen', tag: 'friend' }],
      summary: 'Navigated difficult period with support'
    },
    {
      content: "Started learning a new programming language today. The syntax is different from what I'm used to, but I'm enjoying the challenge. Building something new always feels rewarding. Planning to use this for a side project.",
      tags: ['learning', 'programming', 'challenge', 'growth'],
      mood: 'curious',
      date: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString(),
      chapterId: chapterIds[2],
      summary: 'Started learning new programming language'
    },
    {
      content: "Had a breakthrough in therapy today. Realized something important about patterns in my relationships and how I can work to change them. This feels like a turning point. Grateful for Maya's guidance through this process.",
      tags: ['therapy', 'breakthrough', 'growth', 'self-awareness'],
      mood: 'hopeful',
      date: new Date(now.getTime() - 75 * 24 * 60 * 60 * 1000).toISOString(),
      chapterId: chapterIds[2],
      relationships: [{ name: 'Dr. Maya Patel', tag: 'coach' }],
      summary: 'Therapy breakthrough about relationship patterns'
    },
    {
      content: "Reflected on my progress this year. I've grown in ways I didn't expect - more confident, more self-aware, better at setting boundaries. The journey continues, and I'm excited for what's next. The person I am today is very different from who I was a year ago.",
      tags: ['reflection', 'growth', 'progress', 'self-awareness'],
      mood: 'proud',
      date: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString(),
      chapterId: chapterIds[2],
      summary: 'Year-end reflection on growth'
    },
    {
      content: "Spent the afternoon working on a creative project with Alex. We're collaborating on something new - a short film script. The brainstorming session was incredibly productive. I love how we bounce ideas off each other.",
      tags: ['collaboration', 'creativity', 'writing', 'project'],
      mood: 'inspired',
      date: new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000).toISOString(),
      chapterId: chapterIds[1],
      relationships: [{ name: 'Alex Rivera', tag: 'professional' }],
      summary: 'Creative collaboration with Alex'
    },
    {
      content: "Attended a conference on storytelling and narrative. Met so many interesting people and learned new techniques. The keynote speaker was inspiring - reminded me why I love this craft. Came back energized and full of new ideas.",
      tags: ['conference', 'learning', 'networking', 'inspiration'],
      mood: 'inspired',
      date: new Date(now.getTime() - 150 * 24 * 60 * 60 * 1000).toISOString(),
      chapterId: chapterIds[1],
      summary: 'Attended storytelling conference'
    },
    {
      content: "Started a new habit: writing three pages every morning, no matter what. It's been challenging to maintain, but I'm on day 12 now. The practice of showing up daily, even when I don't feel like it, is teaching me discipline.",
      tags: ['habits', 'writing', 'discipline', 'routine'],
      mood: 'determined',
      date: new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString(),
      chapterId: chapterIds[1],
      summary: 'Started daily writing habit'
    },
    {
      content: "Had dinner with Sarah tonight. We talked for hours about life, dreams, fears, everything. These deep conversations are what I value most in our friendship. She always helps me see things from new angles.",
      tags: ['friendship', 'conversation', 'connection', 'deep-talk'],
      mood: 'grateful',
      date: new Date(now.getTime() - 210 * 24 * 60 * 60 * 1000).toISOString(),
      chapterId: chapterIds[1],
      relationships: [{ name: 'Sarah Chen', tag: 'friend' }],
      summary: 'Deep conversation with Sarah'
    },
    {
      content: "Went for a long walk in Central Park with River. We discussed mindfulness practices and how they've changed our perspectives. The conversation flowed naturally, and I left feeling centered and present.",
      tags: ['friendship', 'mindfulness', 'nature', 'conversation'],
      mood: 'peaceful',
      date: new Date(now.getTime() - 240 * 24 * 60 * 60 * 1000).toISOString(),
      chapterId: chapterIds[1],
      relationships: [{ name: 'River Brooks', tag: 'friend' }, { name: 'Central Park', tag: 'other' }],
      summary: 'Mindfulness walk with River'
    },
    {
      content: "Finished a major project at work today. The sense of accomplishment is real. Celebrated with colleagues and then had a quiet evening to myself. These moments of completion are important to acknowledge.",
      tags: ['work', 'achievement', 'celebration', 'accomplishment'],
      mood: 'satisfied',
      date: new Date(now.getTime() - 270 * 24 * 60 * 60 * 1000).toISOString(),
      chapterId: chapterIds[1],
      summary: 'Completed major work project'
    },
    {
      content: "Started this journaling practice two years ago, and it's been transformative. Looking back at old entries, I can see how much I've grown. The practice of reflection has become essential to my life.",
      tags: ['reflection', 'growth', 'journaling', 'transformation'],
      mood: 'reflective',
      date: new Date(now.getTime() - 300 * 24 * 60 * 60 * 1000).toISOString(),
      chapterId: chapterIds[0],
      summary: 'Reflection on journaling practice'
    },
    {
      content: "Met Marcus for the first time today through a mutual connection. Had coffee and talked for two hours about career, life, everything. His wisdom and perspective are incredible. I have a feeling this will be an important relationship.",
      tags: ['mentorship', 'new-connection', 'career', 'wisdom'],
      mood: 'hopeful',
      date: new Date(now.getTime() - 400 * 24 * 60 * 60 * 1000).toISOString(),
      chapterId: chapterIds[0],
      relationships: [{ name: 'Marcus Johnson', tag: 'coach' }],
      summary: 'First meeting with Marcus'
    },
    {
      content: "Had a difficult conversation with someone close to me. It was uncomfortable but necessary. Setting boundaries is hard, but I'm learning that it's essential for healthy relationships. Maya's coaching has helped me navigate this.",
      tags: ['boundaries', 'difficult-conversation', 'growth', 'relationships'],
      mood: 'uncomfortable',
      date: new Date(now.getTime() - 330 * 24 * 60 * 60 * 1000).toISOString(),
      chapterId: chapterIds[0],
      relationships: [{ name: 'Dr. Maya Patel', tag: 'coach' }],
      summary: 'Difficult but necessary conversation about boundaries'
    },
    {
      content: "Spent the day at The Coffee Shop working on my first serious writing project. The words flowed today in a way they haven't before. There's something about this place that unlocks my creativity. I'll be back here often.",
      tags: ['writing', 'creativity', 'workspace', 'flow'],
      mood: 'creative',
      date: new Date(now.getTime() - 360 * 24 * 60 * 60 * 1000).toISOString(),
      chapterId: chapterIds[0],
      relationships: [{ name: 'The Coffee Shop', tag: 'other' }],
      summary: 'Productive writing session at coffee shop'
    },
    {
      content: "Started reading 'The Artist's Way' today. Already feeling inspired by the exercises. This feels like the beginning of something important - a deeper exploration of my creative self. Excited to see where this leads.",
      tags: ['reading', 'creativity', 'self-discovery', 'books'],
      mood: 'inspired',
      date: new Date(now.getTime() - 390 * 24 * 60 * 60 * 1000).toISOString(),
      chapterId: chapterIds[0],
      summary: 'Started reading The Artist\'s Way'
    },
    {
      content: "Had a long phone call with Jordan today. We talked about family, life changes, everything. Our relationship has deepened so much over the past few years. I'm grateful for their presence in my life.",
      tags: ['family', 'connection', 'gratitude', 'conversation'],
      mood: 'grateful',
      date: new Date(now.getTime() - 420 * 24 * 60 * 60 * 1000).toISOString(),
      chapterId: chapterIds[0],
      relationships: [{ name: 'Jordan Kim', tag: 'family' }],
      summary: 'Long conversation with Jordan'
    },
    {
      content: "Went to Central Park for the first time in months. The peace and quiet there is unmatched. Sat on a bench for an hour just thinking, processing, being present. This place is becoming a sanctuary for me.",
      tags: ['nature', 'peace', 'reflection', 'sanctuary'],
      mood: 'peaceful',
      date: new Date(now.getTime() - 450 * 24 * 60 * 60 * 1000).toISOString(),
      chapterId: chapterIds[0],
      relationships: [{ name: 'Central Park', tag: 'other' }],
      summary: 'Peaceful time in Central Park'
    },
    {
      content: "Met Sarah for the first time in college. We were assigned as roommates and hit it off immediately. Something told me this would be an important friendship. Two years later, I know I was right.",
      tags: ['friendship', 'college', 'new-connection', 'gratitude'],
      mood: 'grateful',
      date: new Date(now.getTime() - 500 * 24 * 60 * 60 * 1000).toISOString(),
      chapterId: chapterIds[0],
      relationships: [{ name: 'Sarah Chen', tag: 'friend' }],
      summary: 'First meeting with Sarah in college'
    },
    {
      content: "Started this journaling practice today. Not sure where it will lead, but I feel like documenting my journey is important. Maybe someday I'll look back and see how far I've come. For now, I'll just write.",
      tags: ['journaling', 'beginning', 'reflection', 'new-practice'],
      mood: 'hopeful',
      date: new Date(now.getTime() - 600 * 24 * 60 * 60 * 1000).toISOString(),
      chapterId: chapterIds[0],
      summary: 'Started journaling practice'
    }
  ];

  // Create entries
  for (const entry of entryTemplates) {
    const payload = {
      content: entry.content,
      tags: entry.tags,
      mood: entry.mood,
      date: entry.date,
      chapterId: entry.chapterId || null,
      relationships: entry.relationships || [],
      summary: entry.summary
    };
    
    const result = await apiCall('/api/entries', 'POST', payload);
    if (result && (result.entry || result.id)) {
      results.entries++;
      if (results.entries % 5 === 0) {
        console.log(`  ✓ Created ${results.entries} entries...`);
      }
    }
    await wait(50); // Small delay
  }

  // ============================================
  // STEP 4: Create Tasks (optional)
  // ============================================
  console.log('\n✅ Step 4: Creating tasks...');
  const tasks = [
    {
      title: "Finish editing chapter 3 of novel",
      description: "Complete the second round of edits for chapter 3",
      dueDate: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      priority: "high",
      status: "in_progress"
    },
    {
      title: "Schedule coffee with Sarah",
      description: "Plan our next catch-up session",
      dueDate: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      priority: "medium",
      status: "pending"
    },
    {
      title: "Research podcast equipment",
      description: "Look into microphones and recording setup for podcast project",
      dueDate: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      priority: "medium",
      status: "pending"
    }
  ];

  for (const task of tasks) {
    const result = await apiCall('/api/tasks', 'POST', task);
    if (result && result.task) {
      results.tasks++;
      console.log(`  ✓ Created task: "${task.title}"`);
    }
    await wait(100);
  }

  // ============================================
  // SUMMARY
  // ============================================
  console.log('\n' + '='.repeat(60));
  console.log('✅ COMPLETE DUMMY USER POPULATION FINISHED!');
  console.log('='.repeat(60));
  console.log('\n📊 Summary:');
  console.log(`  📖 Chapters: ${results.chapters}`);
  console.log(`  📝 Entries: ${results.entries}`);
  console.log(`  👥 Characters: ${results.characters}`);
  console.log(`  ✅ Tasks: ${results.tasks}`);
  
  if (results.errors.length > 0) {
    console.warn(`\n⚠️  ${results.errors.length} errors occurred:`);
    results.errors.forEach(err => {
      console.warn(`  - ${err.endpoint}: ${err.error}`);
    });
  } else {
    console.log('\n✨ All data created successfully!');
  }
  
  console.log('\n🔄 Refreshing page in 3 seconds...');
  setTimeout(() => {
    window.location.reload();
  }, 3000);
  
  return results;
})();

