/**
 * TypeScript script to populate dummy data via Supabase client
 * Run with: pnpm tsx scripts/populate-dummy-data-psql.ts
 */

import { createClient } from '@supabase/supabase-js';
import { config } from '../apps/server/src/config';

const DEV_USER_ID = 'dev-user-id';

async function populateDummyData() {
  console.log('🚀 Starting dummy data population...\n');

  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    console.error('❌ Supabase configuration missing. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false }
  });

  const results = {
    chapters: 0,
    characters: 0,
    entries: 0,
    tasks: 0,
    relationships: 0,
    memories: 0
  };

  try {
    // Create Chapters
    console.log('📖 Creating chapters...');
    const chapters = [
      {
        id: `ch1-${DEV_USER_ID}`,
        user_id: DEV_USER_ID,
        title: 'The Awakening: Discovering Purpose',
        start_date: '2023-01-01T00:00:00Z',
        end_date: '2024-05-30T23:59:59Z',
        description: 'A period of self-discovery, learning what truly matters, and finding my path forward.',
        summary: 'A transformative period where I discovered my true passions and began building the foundation for my future.'
      },
      {
        id: `ch2-${DEV_USER_ID}`,
        user_id: DEV_USER_ID,
        title: 'Building Foundations: Growth & Learning',
        start_date: '2024-06-01T00:00:00Z',
        end_date: '2024-11-30T23:59:59Z',
        description: 'Focusing on building skills, deepening relationships, and establishing routines that support my goals.',
        summary: 'A period of consistent growth, learning new skills, and strengthening relationships.'
      },
      {
        id: `ch3-${DEV_USER_ID}`,
        user_id: DEV_USER_ID,
        title: 'Current Chapter: Living Intentionally',
        start_date: '2024-12-01T00:00:00Z',
        end_date: null,
        description: 'The ongoing journey of living with intention, pursuing meaningful goals, and building a life aligned with my values.',
        summary: 'The current phase of my life, focused on intentional living.'
      }
    ];

    for (const chapter of chapters) {
      const { error } = await supabase
        .from('chapters')
        .upsert(chapter, { onConflict: 'id' });
      
      if (error) {
        console.error(`  ❌ Failed to create chapter "${chapter.title}":`, error.message);
      } else {
        results.chapters++;
        console.log(`  ✅ Created chapter: "${chapter.title}"`);
      }
    }

    // Create Characters
    console.log('\n👥 Creating characters...');
    const characters = [
      {
        id: `char1-${DEV_USER_ID}`,
        user_id: DEV_USER_ID,
        name: 'Sarah Chen',
        alias: ['Sarah', 'Sara'],
        pronouns: 'she/her',
        archetype: 'ally',
        role: 'Best Friend',
        summary: 'My closest friend and confidante. We met in college and have been inseparable ever since.',
        tags: ['friendship', 'support', 'honesty', 'loyalty'],
        metadata: {
          relationship_type: 'friend',
          closeness_score: 95,
          first_met: '2018-09-15'
        }
      },
      {
        id: `char2-${DEV_USER_ID}`,
        user_id: DEV_USER_ID,
        name: 'Marcus Johnson',
        alias: ['Marcus', 'Marc'],
        pronouns: 'he/him',
        archetype: 'mentor',
        role: 'Mentor & Coach',
        summary: 'A wise mentor who has guided me through many career and life decisions.',
        tags: ['mentorship', 'wisdom', 'career', 'guidance'],
        metadata: {
          relationship_type: 'coach',
          closeness_score: 85,
          first_met: '2020-03-10'
        }
      },
      {
        id: `char3-${DEV_USER_ID}`,
        user_id: DEV_USER_ID,
        name: 'Alex Rivera',
        alias: ['Alex', 'A.R.'],
        pronouns: 'they/them',
        archetype: 'collaborator',
        role: 'Creative Collaborator',
        summary: 'A talented creative collaborator I\'ve worked with on several projects.',
        tags: ['collaboration', 'creativity', 'professional'],
        metadata: {
          relationship_type: 'professional',
          closeness_score: 75,
          first_met: '2021-07-20'
        }
      },
      {
        id: `char4-${DEV_USER_ID}`,
        user_id: DEV_USER_ID,
        name: 'Jordan Kim',
        alias: ['Jordan', 'J'],
        pronouns: 'they/them',
        archetype: 'family',
        role: 'Sibling',
        summary: 'My sibling and one of the most important people in my life.',
        tags: ['family', 'sibling', 'support'],
        metadata: {
          relationship_type: 'family',
          closeness_score: 90,
          first_met: '1995-06-15'
        }
      },
      {
        id: `char5-${DEV_USER_ID}`,
        user_id: DEV_USER_ID,
        name: 'Dr. Maya Patel',
        alias: ['Maya', 'Dr. Patel'],
        pronouns: 'she/her',
        archetype: 'mentor',
        role: 'Life Coach',
        summary: 'A life coach who has helped me navigate personal challenges.',
        tags: ['coaching', 'growth', 'self-awareness'],
        metadata: {
          relationship_type: 'coach',
          closeness_score: 80,
          first_met: '2022-01-15'
        }
      },
      {
        id: `char6-${DEV_USER_ID}`,
        user_id: DEV_USER_ID,
        name: 'The Coffee Shop',
        alias: ['Coffee Shop', 'The Shop'],
        pronouns: 'it/its',
        archetype: 'place',
        role: 'Workspace',
        summary: 'My favorite place to work and think.',
        tags: ['workspace', 'creativity', 'routine'],
        metadata: {
          relationship_type: 'place',
          visit_frequency: 'weekly'
        }
      },
      {
        id: `char7-${DEV_USER_ID}`,
        user_id: DEV_USER_ID,
        name: 'Central Park',
        alias: ['The Park'],
        pronouns: 'it/its',
        archetype: 'place',
        role: 'Reflection Space',
        summary: 'A peaceful place for walks and reflection.',
        tags: ['nature', 'peace', 'reflection'],
        metadata: {
          relationship_type: 'place',
          visit_frequency: 'bi-weekly'
        }
      }
    ];

    for (const char of characters) {
      const { error } = await supabase
        .from('characters')
        .upsert(char, { onConflict: 'id' });
      
      if (error) {
        console.error(`  ❌ Failed to create character "${char.name}":`, error.message);
      } else {
        results.characters++;
        console.log(`  ✅ Created character: "${char.name}"`);
      }
    }

    // Create Journal Entries
    console.log('\n📝 Creating journal entries...');
    const entries = [
      {
        user_id: DEV_USER_ID,
        date: '2024-11-16T10:00:00Z',
        content: 'Just had an amazing conversation with Sarah about our future plans. We discussed starting a creative project together - a podcast about personal growth and storytelling.',
        tags: ['friendship', 'creativity', 'collaboration', 'excitement'],
        chapter_id: `ch3-${DEV_USER_ID}`,
        mood: 'excited',
        summary: 'Planning a creative podcast project with Sarah',
        source: 'manual'
      },
      {
        user_id: DEV_USER_ID,
        date: '2024-11-15T14:30:00Z',
        content: 'Finished reading "The Creative Process" by Marcus\'s recommendation. The book challenged everything I thought I knew about creativity.',
        tags: ['reading', 'creativity', 'learning', 'insight'],
        chapter_id: `ch3-${DEV_USER_ID}`,
        mood: 'thoughtful',
        summary: 'Finished reading about creativity and process',
        source: 'manual'
      },
      {
        user_id: DEV_USER_ID,
        date: '2024-11-14T16:00:00Z',
        content: 'Spent the afternoon at The Coffee Shop working on my novel. Wrote 2,000 words - a personal best! Met Alex there and we discussed our respective projects.',
        tags: ['writing', 'creativity', 'achievement', 'focus'],
        chapter_id: `ch3-${DEV_USER_ID}`,
        mood: 'accomplished',
        summary: 'Productive writing session at the coffee shop',
        source: 'manual'
      },
      {
        user_id: DEV_USER_ID,
        date: '2024-11-13T11:00:00Z',
        content: 'Had a coaching session with Maya today. We talked about setting boundaries and saying no without guilt. This has been a challenge for me, but I\'m making progress.',
        tags: ['coaching', 'growth', 'boundaries', 'self-care'],
        chapter_id: `ch3-${DEV_USER_ID}`,
        mood: 'reflective',
        summary: 'Coaching session about boundaries',
        source: 'manual'
      },
      {
        user_id: DEV_USER_ID,
        date: '2024-11-12T09:00:00Z',
        content: 'Went for a long walk in Central Park today. The weather was perfect - crisp autumn air, golden leaves everywhere. I felt a sense of peace I haven\'t felt in a while.',
        tags: ['nature', 'peace', 'reflection', 'walking'],
        chapter_id: `ch3-${DEV_USER_ID}`,
        mood: 'peaceful',
        summary: 'Peaceful walk in Central Park',
        source: 'manual'
      }
    ];

    for (const entry of entries) {
      const { error } = await supabase
        .from('journal_entries')
        .insert(entry);
      
      if (error) {
        console.error(`  ❌ Failed to create entry:`, error.message);
      } else {
        results.entries++;
        console.log(`  ✅ Created entry: "${entry.summary}"`);
      }
    }

    // Create Tasks
    console.log('\n✅ Creating tasks...');
    const tasks = [
      {
        user_id: DEV_USER_ID,
        title: 'Finish novel first draft',
        description: 'Complete the remaining chapters and do initial review',
        category: 'creative',
        status: 'in_progress',
        priority: 5,
        due_date: '2024-12-31T23:59:59Z',
        source: 'manual'
      },
      {
        user_id: DEV_USER_ID,
        title: 'Plan podcast launch',
        description: 'Research equipment, outline first episodes, set up hosting',
        category: 'project',
        status: 'incomplete',
        priority: 4,
        due_date: '2025-01-15T23:59:59Z',
        source: 'manual'
      },
      {
        user_id: DEV_USER_ID,
        title: 'Schedule coffee with Sarah',
        description: 'Catch up and discuss podcast ideas',
        category: 'social',
        status: 'incomplete',
        priority: 3,
        due_date: '2024-11-25T18:00:00Z',
        source: 'manual'
      }
    ];

    for (const task of tasks) {
      const { error } = await supabase
        .from('tasks')
        .insert(task);
      
      if (error) {
        console.error(`  ❌ Failed to create task:`, error.message);
      } else {
        results.tasks++;
        console.log(`  ✅ Created task: "${task.title}"`);
      }
    }

    console.log('\n✨ Dummy data population complete!');
    console.log('\n📊 Summary:');
    console.log(`   - Chapters: ${results.chapters}`);
    console.log(`   - Characters: ${results.characters}`);
    console.log(`   - Journal Entries: ${results.entries}`);
    console.log(`   - Tasks: ${results.tasks}`);
    console.log(`\n🔗 User ID: ${DEV_USER_ID}`);

  } catch (error) {
    console.error('❌ Error populating dummy data:', error);
    process.exit(1);
  }
}

populateDummyData();

