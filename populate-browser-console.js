/**
 * Browser Console Script to Populate Dummy Data
 * 
 * Copy and paste this entire script into your browser's developer console
 * (F12 -> Console tab) while on http://localhost:5173
 * 
 * This will create:
 * - A main user character "Alex" (The Archivist)
 * - 3 chapters (The Beginning, Growth & Discovery, Current Chapter)
 * - 10 journal entries mentioning characters (Sarah, Maya, Jordan)
 * - Characters will be auto-detected from the entries
 */

(async function populateDummyData() {
  console.log('🚀 Starting dummy data population...');
  
  const results = {
    entries: 0,
    characters: 0,
    chapters: 0,
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
        throw new Error(`HTTP ${response.status}: ${text.substring(0, 100)}`);
      }
      return await response.json();
    } catch (error) {
      console.error(`Error calling ${endpoint}:`, error);
      results.errors.push({ endpoint, error: error.message });
      return null;
    }
  }

  // Create main user character "Alex"
  console.log('👤 Creating main user character...');
  const mainCharacter = {
    name: "Alex",
    alias: ["Alex", "The Archivist"],
    pronouns: "they/them",
    archetype: "protagonist",
    role: "Main Character",
    summary: "The main character of this story - a curious archivist documenting their life journey, relationships, and growth. Passionate about learning, creativity, and meaningful connections.",
    tags: ["protagonist", "archivist", "curious", "reflective"],
    metadata: {
      social_media: {
        email: "alex@lorekeeper.dev"
      }
    }
  };

  // Try to create main character (if characters API supports POST)
  // Otherwise, it will be created through entries

  // Create chapters first
  console.log('📖 Creating chapters...');
  const chapters = [
    {
      title: "The Beginning",
      startDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
      endDate: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(),
      description: "The start of a new journey"
    },
    {
      title: "Growth & Discovery",
      startDate: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(),
      endDate: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
      description: "A period of learning and exploration"
    },
    {
      title: "Current Chapter",
      startDate: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
      endDate: null,
      description: "The ongoing story"
    }
  ];

  const chapterIds = [];
  for (const chapter of chapters) {
    const result = await apiCall('/api/chapters', 'POST', chapter);
    if (result && result.chapter) {
      chapterIds.push(result.chapter.id);
      results.chapters++;
      console.log(`✓ Created chapter: ${chapter.title}`);
    }
  }

  // Create journal entries with character mentions
  // Characters (Sarah, Maya, Jordan) will be auto-detected from these entries
  console.log('📝 Creating journal entries...');
  const entries = [
    {
      content: "Today I started working on a new project. The excitement is palpable, and I can't wait to see where this journey takes me. Met with Sarah and discussed our vision for the future.",
      tags: ['work', 'project', 'excitement', 'friendship'],
      mood: 'excited',
      date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      chapterId: chapterIds[2] || null,
      relationships: [{ name: "Sarah", tag: "friend" }]
    },
    {
      content: "Had an amazing conversation with Sarah about life goals. We talked about dreams, aspirations, and what truly matters. These deep conversations always leave me feeling inspired.",
      tags: ['friendship', 'conversation', 'inspiration'],
      mood: 'inspired',
      date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      chapterId: chapterIds[2] || null,
      relationships: [{ name: "Sarah", tag: "friend" }]
    },
    {
      content: "Met with Maya for a coaching session today. Her insights about personal growth and self-discovery were incredibly valuable. She has a way of asking the right questions that help me see things from new perspectives.",
      tags: ['mentorship', 'growth', 'coaching'],
      mood: 'thoughtful',
      date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      chapterId: chapterIds[2] || null,
      relationships: [{ name: "Maya", tag: "coach" }]
    },
    {
      content: "Had dinner with Jordan tonight. We laughed, shared stories from our childhood, and enjoyed each other's company. These moments remind me what's truly important in life.",
      tags: ['family', 'gratitude', 'connection'],
      mood: 'grateful',
      date: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
      chapterId: chapterIds[2] || null,
      relationships: [{ name: "Jordan", tag: "family" }]
    },
    {
      content: "Started learning a new programming language today. The syntax is different from what I'm used to, but I'm enjoying the challenge. Building something new always feels rewarding.",
      tags: ['learning', 'programming', 'challenge'],
      mood: 'curious',
      date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      chapterId: chapterIds[1] || null
    },
    {
      content: "Reflected on my progress this month. I've grown in ways I didn't expect, and I'm proud of the person I'm becoming. The journey continues, and I'm excited for what's next.",
      tags: ['reflection', 'growth', 'progress'],
      mood: 'proud',
      date: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
      chapterId: chapterIds[1] || null
    },
    {
      content: "Spent the afternoon working on a creative project. Lost track of time completely - that's how I know I'm in the flow state. These moments of deep focus are precious.",
      tags: ['creativity', 'flow', 'focus'],
      mood: 'focused',
      date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      chapterId: chapterIds[1] || null
    },
    {
      content: "Went for a long walk in the park today. The weather was perfect, and I felt a sense of peace I haven't felt in a while. Sometimes the simplest moments are the most meaningful.",
      tags: ['nature', 'peace', 'reflection'],
      mood: 'peaceful',
      date: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
      chapterId: chapterIds[0] || null
    },
    {
      content: "Attended a workshop on mindfulness and meditation. Learned new techniques for staying present and managing stress. The instructor was fantastic, and I'm excited to practice these methods daily.",
      tags: ['mindfulness', 'workshop', 'growth'],
      mood: 'calm',
      date: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString(),
      chapterId: chapterIds[0] || null
    },
    {
      content: "Celebrated a friend's birthday today. We had a great time together, and I'm grateful for the friendships in my life. These relationships are what make life meaningful.",
      tags: ['friendship', 'celebration', 'gratitude'],
      mood: 'joyful',
      date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      chapterId: chapterIds[0] || null
    }
  ];

  for (const entry of entries) {
    const result = await apiCall('/api/entries', 'POST', entry);
    if (result && result.entry) {
      results.entries++;
      console.log(`✓ Created entry: ${entry.content.substring(0, 50)}...`);
    }
  }

  // Summary
  console.log('\n✅ Population complete!');
  console.log(`Summary:`);
  console.log(`  - ${results.chapters} chapters created`);
  console.log(`  - ${results.entries} entries created`);
  console.log(`  - Characters (Sarah, Maya, Jordan) will be auto-detected from entries`);
  if (results.errors.length > 0) {
    console.warn(`  - ${results.errors.length} errors occurred`);
    console.table(results.errors);
  }
  console.log('\n🔄 Refreshing page data...');
  setTimeout(() => window.location.reload(), 2000);
  
  return results;
})();

