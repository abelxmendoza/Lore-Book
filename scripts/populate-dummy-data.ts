#!/usr/bin/env tsx
/**
 * Populate the app with dummy data for development/testing
 * 
 * Usage:
 *   pnpm tsx scripts/populate-dummy-data.ts
 * 
 * This script requires:
 * - A valid Supabase connection
 * - An authenticated user session (you'll need to provide user ID or create a test user)
 */

import { createClient } from '@supabase/supabase-js';
import { config } from '../apps/server/src/config';
import { v4 as uuid } from 'uuid';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: { persistSession: false }
});

// Dummy data templates
const dummyEntries = [
  {
    content: "Today I started working on a new project. The excitement is palpable, and I can't wait to see where this journey takes me. Met with the team and discussed our vision for the future.",
    tags: ['work', 'project', 'excitement'],
    mood: 'excited',
    date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    content: "Had an amazing conversation with Sarah about life goals. We talked about dreams, aspirations, and what truly matters. These deep conversations always leave me feeling inspired.",
    tags: ['friendship', 'conversation', 'inspiration'],
    mood: 'inspired',
    date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    content: "Went for a long walk in the park today. The weather was perfect, and I felt a sense of peace I haven't felt in a while. Sometimes the simplest moments are the most meaningful.",
    tags: ['nature', 'peace', 'reflection'],
    mood: 'peaceful',
    date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    content: "Finished reading an incredible book that challenged my perspective on creativity. The author's insights about the creative process resonated deeply with me. Time to apply these lessons.",
    tags: ['reading', 'creativity', 'learning'],
    mood: 'thoughtful',
    date: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    content: "Attended a workshop on mindfulness and meditation. Learned new techniques for staying present and managing stress. The instructor was fantastic, and I'm excited to practice these methods daily.",
    tags: ['mindfulness', 'workshop', 'growth'],
    mood: 'calm',
    date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    content: "Had dinner with my family tonight. We laughed, shared stories, and enjoyed each other's company. These moments remind me what's truly important in life.",
    tags: ['family', 'gratitude', 'connection'],
    mood: 'grateful',
    date: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    content: "Started learning a new programming language today. The syntax is different from what I'm used to, but I'm enjoying the challenge. Building something new always feels rewarding.",
    tags: ['learning', 'programming', 'challenge'],
    mood: 'curious',
    date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    content: "Went to a concert with friends. The music was incredible, and the energy in the room was electric. These shared experiences create bonds that last a lifetime.",
    tags: ['music', 'friends', 'experience'],
    mood: 'energetic',
    date: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    content: "Reflected on my progress this month. I've grown in ways I didn't expect, and I'm proud of the person I'm becoming. The journey continues, and I'm excited for what's next.",
    tags: ['reflection', 'growth', 'progress'],
    mood: 'proud',
    date: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    content: "Spent the afternoon working on a creative project. Lost track of time completely - that's how I know I'm in the flow state. These moments of deep focus are precious.",
    tags: ['creativity', 'flow', 'focus'],
    mood: 'focused',
    date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    content: "Had a breakthrough moment in understanding a complex problem I've been working on. Sometimes stepping away and coming back with fresh eyes makes all the difference.",
    tags: ['breakthrough', 'problem-solving', 'insight'],
    mood: 'accomplished',
    date: new Date(Date.now() - 11 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    content: "Met someone new at a networking event. We had an interesting conversation about technology and innovation. You never know where these connections might lead.",
    tags: ['networking', 'connection', 'technology'],
    mood: 'optimistic',
    date: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    content: "Took a day trip to the mountains. The view was breathtaking, and I felt a sense of awe at the beauty of nature. These experiences remind me to appreciate the world around me.",
    tags: ['travel', 'nature', 'awe'],
    mood: 'awe',
    date: new Date(Date.now() - 13 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    content: "Completed a challenging workout today. Pushed myself harder than usual and felt great afterward. Physical activity always clears my mind and boosts my energy.",
    tags: ['fitness', 'health', 'discipline'],
    mood: 'energetic',
    date: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    content: "Watched a documentary that opened my eyes to new perspectives. The stories were powerful and thought-provoking. I love how media can expand our understanding of the world.",
    tags: ['learning', 'documentary', 'perspective'],
    mood: 'thoughtful',
    date: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    content: "Had a productive brainstorming session with my team. We came up with some innovative ideas that could really make a difference. Collaboration brings out the best in everyone.",
    tags: ['collaboration', 'innovation', 'teamwork'],
    mood: 'creative',
    date: new Date(Date.now() - 16 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    content: "Spent time volunteering at a local community center. Helping others always fills me with a sense of purpose and connection. Giving back is one of the most rewarding experiences.",
    tags: ['volunteering', 'community', 'purpose'],
    mood: 'fulfilled',
    date: new Date(Date.now() - 17 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    content: "Tried a new recipe for dinner tonight. Cooking is such a meditative activity, and I love experimenting with flavors. The dish turned out great!",
    tags: ['cooking', 'creativity', 'experimentation'],
    mood: 'satisfied',
    date: new Date(Date.now() - 18 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    content: "Attended a lecture on philosophy and ethics. The discussion was engaging and made me think deeply about my values and beliefs. Continuous learning keeps life interesting.",
    tags: ['philosophy', 'learning', 'values'],
    mood: 'contemplative',
    date: new Date(Date.now() - 19 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    content: "Celebrated a friend's birthday today. We had a great time together, and I'm grateful for the friendships in my life. These relationships are what make life meaningful.",
    tags: ['friendship', 'celebration', 'gratitude'],
    mood: 'joyful',
    date: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString()
  }
];

const dummyChapters = [
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

const dummyCharacters = [
  {
    name: "Sarah",
    alias: ["Sarah", "Sara"],
    pronouns: "she/her",
    archetype: "friend",
    role: "Close friend and confidant",
    summary: "A thoughtful friend who always has insightful perspectives",
    tags: ['friendship', 'conversation'],
    metadata: {
      social_media: {
        instagram: "@sarah_life",
        twitter: "@sarah_tweets",
        email: "sarah@example.com"
      }
    }
  },
  {
    name: "Alex",
    alias: ["Alex", "Alexandra"],
    pronouns: "they/them",
    archetype: "colleague",
    role: "Team member and collaborator",
    summary: "Creative and innovative team member",
    tags: ['work', 'collaboration'],
    metadata: {
      social_media: {
        linkedin: "alex-professional",
        github: "alex-dev"
      }
    }
  },
  {
    name: "Maya",
    alias: ["Maya"],
    pronouns: "she/her",
    archetype: "mentor",
    role: "Life coach and guide",
    summary: "Wise mentor who provides guidance and support",
    tags: ['mentorship', 'guidance'],
    metadata: {
      social_media: {
        website: "mayacoaching.com",
        email: "maya@coaching.com"
      }
    }
  },
  {
    name: "Jordan",
    alias: ["Jordan", "J"],
    pronouns: "he/him",
    archetype: "family",
    role: "Sibling",
    summary: "Supportive family member",
    tags: ['family', 'support'],
    metadata: {}
  }
];

const dummyMemoirSections = [
  {
    title: "Early Days",
    content: "In the beginning, everything felt new and uncertain. I was navigating uncharted territory, learning about myself and the world around me. Each day brought new experiences and opportunities for growth.",
    order: 0,
    period: {
      from: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
      to: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString()
    }
  },
  {
    title: "Finding My Path",
    content: "As time passed, I began to understand more about who I am and what I want from life. The journey wasn't always easy, but each challenge taught me something valuable. I discovered passions I never knew I had and met people who would become important parts of my story.",
    order: 1,
    period: {
      from: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(),
      to: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString()
    }
  },
  {
    title: "The Present Moment",
    content: "Now, as I reflect on where I am today, I see how far I've come. The experiences I've had, the people I've met, and the lessons I've learned have all shaped me into the person I am now. The story continues to unfold, and I'm excited to see what comes next.",
    order: 2,
    period: {
      from: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
      to: new Date().toISOString()
    }
  }
];

async function getUserId(): Promise<string> {
  // Try to get the first user from the database
  const { data: users, error } = await supabase.auth.admin.listUsers();
  
  if (error || !users || users.users.length === 0) {
    console.log('No users found. Creating a test user...');
    // Create a test user
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email: 'test@lorekeeper.dev',
      password: 'testpassword123',
      email_confirm: true
    });
    
    if (createError || !newUser.user) {
      throw new Error(`Failed to create test user: ${createError?.message}`);
    }
    
    console.log(`Created test user: ${newUser.user.email} (${newUser.user.id})`);
    return newUser.user.id;
  }
  
  const userId = users.users[0].id;
  console.log(`Using existing user: ${users.users[0].email} (${userId})`);
  return userId;
}

async function populateEntries(userId: string, chapterIds: string[]): Promise<void> {
  console.log('Creating journal entries...');
  
  const entries = dummyEntries.map((entry, index) => ({
    id: uuid(),
    user_id: userId,
    content: entry.content,
    date: entry.date,
    tags: entry.tags,
    mood: entry.mood,
    summary: entry.content.substring(0, 100) + '...',
    source: 'manual' as const,
    chapter_id: index < 7 ? chapterIds[0] : index < 14 ? chapterIds[1] : chapterIds[2],
    metadata: {},
    created_at: entry.date,
    updated_at: entry.date
  }));

  const { error } = await supabase.from('journal_entries').insert(entries);
  
  if (error) {
    console.error('Error creating entries:', error);
    throw error;
  }
  
  console.log(`✓ Created ${entries.length} journal entries`);
}

async function populateChapters(userId: string): Promise<string[]> {
  console.log('Creating chapters...');
  
  const chapters = dummyChapters.map(chapter => ({
    id: uuid(),
    user_id: userId,
    title: chapter.title,
    start_date: chapter.startDate,
    end_date: chapter.endDate,
    description: chapter.description,
    created_at: chapter.startDate,
    updated_at: chapter.startDate
  }));

  const { error } = await supabase.from('chapters').insert(chapters);
  
  if (error) {
    console.error('Error creating chapters:', error);
    throw error;
  }
  
  console.log(`✓ Created ${chapters.length} chapters`);
  return chapters.map(c => c.id);
}

async function populateCharacters(userId: string): Promise<void> {
  console.log('Creating characters...');
  
  const characters = dummyCharacters.map(char => ({
    id: uuid(),
    user_id: userId,
    name: char.name,
    alias: char.alias,
    pronouns: char.pronouns,
    archetype: char.archetype,
    role: char.role,
    status: 'active',
    summary: char.summary,
    tags: char.tags,
    metadata: char.metadata,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }));

  const { error } = await supabase.from('characters').insert(characters);
  
  if (error) {
    console.error('Error creating characters:', error);
    throw error;
  }
  
  console.log(`✓ Created ${characters.length} characters`);
}

async function populateMemoir(userId: string): Promise<void> {
  console.log('Creating memoir outline...');
  
  const outline = {
    id: uuid(),
    user_id: userId,
    title: 'My Life Story',
    sections: dummyMemoirSections.map((section, index) => ({
      id: uuid(),
      title: section.title,
      content: section.content,
      order: section.order,
      period: section.period,
      lastUpdated: section.period.to || new Date().toISOString()
    })),
    lastUpdated: new Date().toISOString(),
    autoUpdate: true,
    metadata: {
      languageStyle: 'reflective and introspective'
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase.from('memoir_outlines').upsert(outline, {
    onConflict: 'user_id'
  });
  
  if (error) {
    console.error('Error creating memoir outline:', error);
    throw error;
  }
  
  console.log(`✓ Created memoir outline with ${dummyMemoirSections.length} sections`);
}

async function main() {
  try {
    console.log('🚀 Starting dummy data population...\n');
    
    const userId = await getUserId();
    
    // Create chapters first (entries need chapter IDs)
    const chapterIds = await populateChapters(userId);
    
    // Create entries
    await populateEntries(userId, chapterIds);
    
    // Create characters
    await populateCharacters(userId);
    
    // Create memoir outline
    await populateMemoir(userId);
    
    console.log('\n✅ Successfully populated app with dummy data!');
    console.log(`\nSummary:`);
    console.log(`  - ${dummyChapters.length} chapters`);
    console.log(`  - ${dummyEntries.length} journal entries`);
    console.log(`  - ${dummyCharacters.length} characters`);
    console.log(`  - ${dummyMemoirSections.length} memoir sections`);
    console.log(`\nYou can now explore the app with this data!`);
    
  } catch (error) {
    console.error('❌ Error populating dummy data:', error);
    process.exit(1);
  }
}

main();

