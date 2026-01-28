import type { ChronologyEntry, Timeline, TimePrecision } from '../types/timelineV2';

/**
 * Generate realistic mock timeline data for UI development
 * Includes complete 9-level hierarchy: Mythos → Epochs → Eras → Sagas → Arcs → Chapters → Scenes → Actions → MicroActions
 */
export const generateMockTimelines = (): Timeline[] => {
  const now = new Date();
  const fiveYearsAgo = new Date(now);
  fiveYearsAgo.setFullYear(now.getFullYear() - 5);
  const threeYearsAgo = new Date(now);
  threeYearsAgo.setFullYear(now.getFullYear() - 3);
  const twoYearsAgo = new Date(now);
  twoYearsAgo.setFullYear(now.getFullYear() - 2);
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(now.getFullYear() - 1);

  const timelines: Timeline[] = [
    // ============================================
    // LEVEL 1: MYTHOS - "The Quest for Self-Discovery"
    // ============================================
    {
      id: 'mythos-quest-self-discovery',
      user_id: 'mock-user',
      title: 'The Quest for Self-Discovery',
      description: 'The overarching narrative of my entire life—a journey of understanding who I am, what I value, and where I\'m heading. This is the grand story that defines my existence.',
      timeline_type: 'life_era',
      parent_id: null,
      start_date: fiveYearsAgo.toISOString(),
      end_date: null, // Ongoing
      tags: ['mythos', 'life-journey', 'self-discovery', 'transformation', 'growth'],
      metadata: { layer: 'mythos', layer_order: 1 },
      created_at: fiveYearsAgo.toISOString(),
      updated_at: now.toISOString(),
      children: []
    },

    // ============================================
    // LEVEL 2: EPOCH - "The Transformation Years"
    // ============================================
    {
      id: 'epoch-transformation-years',
      user_id: 'mock-user',
      title: 'The Transformation Years',
      description: 'A major life phase spanning years where I fundamentally changed who I am. This epoch represents my shift from uncertainty to purpose, from following to leading.',
      timeline_type: 'life_era',
      parent_id: 'mythos-quest-self-discovery',
      start_date: threeYearsAgo.toISOString(),
      end_date: null,
      tags: ['epoch', 'transformation', 'growth', 'career', 'relationships'],
      metadata: { layer: 'epoch', layer_order: 2 },
      created_at: threeYearsAgo.toISOString(),
      updated_at: now.toISOString(),
      children: []
    },

    // ============================================
    // LEVEL 3: ERA - "The Creative Renaissance"
    // ============================================
    {
      id: 'era-creative-renaissance',
      user_id: 'mock-user',
      title: 'The Creative Renaissance',
      description: 'A significant period within the transformation epoch where I rediscovered my creative passions. This era marked my return to art, music, and storytelling after years of focusing solely on career. With Marcus\'s encouragement, I began music production with Alex Rivera in my home studio, started writing at coffee shops with Sarah and Emma, and met Alex (my girlfriend) during this transition. This era represents my shift from corporate tech to creative work.',
      timeline_type: 'custom',
      parent_id: 'epoch-transformation-years',
      start_date: new Date(twoYearsAgo.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString(),
      end_date: null,
      tags: ['era', 'creative', 'art', 'music', 'renaissance', 'self-expression'],
      metadata: { layer: 'era', layer_order: 3 },
      created_at: twoYearsAgo.toISOString(),
      updated_at: now.toISOString(),
      children: []
    },

    // ============================================
    // LEVEL 4: SAGA - "The Music Production Saga"
    // ============================================
    {
      id: 'saga-music-production',
      user_id: 'mock-user',
      title: 'The Music Production Saga',
      description: 'A long narrative arc about my journey into music production. From buying my first MIDI controller to releasing my first EP, this saga tells the complete story of my musical evolution. Marcus introduced me to Alex Rivera, who became my music production collaborator. We work together in my home studio, and Alex (my girlfriend) has been supportive throughout this journey.',
      timeline_type: 'skill',
      parent_id: 'era-creative-renaissance',
      start_date: new Date(twoYearsAgo.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      end_date: null,
      tags: ['saga', 'music', 'production', 'audio', 'creative', 'learning'],
      metadata: { layer: 'saga', layer_order: 4 },
      created_at: new Date(twoYearsAgo.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: now.toISOString(),
      children: []
    },

    // ============================================
    // LEVEL 5: ARC - "The First Album Arc"
    // ============================================
    {
      id: 'arc-first-album',
      user_id: 'mock-user',
      title: 'The First Album Arc',
      description: 'A story arc within the music production saga—the journey of creating my first complete EP. This arc follows the progression from concept (conceived during a late-night session in my home studio) to completion, with all its challenges and breakthroughs. Alex Rivera is helping me produce it, and the concept explores themes of transformation, leaving tech behind, and finding my creative voice.',
      timeline_type: 'custom',
      parent_id: 'saga-music-production',
      start_date: new Date(oneYearAgo.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      end_date: null,
      tags: ['arc', 'album', 'music', 'production', 'creative-project'],
      metadata: { layer: 'arc', layer_order: 5 },
      created_at: new Date(oneYearAgo.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: now.toISOString(),
      children: []
    },

    // ============================================
    // LEVEL 6: CHAPTER - "Chapter 1: The Concept"
    // ============================================
    {
      id: 'chapter-concept',
      user_id: 'mock-user',
      title: 'Chapter 1: The Concept',
      description: 'The first chapter of the EP arc—where the initial idea was born during a late-night session in my home studio. This chapter captures the moment of inspiration, the early sketches, and the vision that would guide the entire project. I called Alex (my girlfriend) to tell her about the concept, and she was excited for me.',
      timeline_type: 'custom',
      parent_id: 'arc-first-album',
      start_date: new Date(oneYearAgo.getTime() + 45 * 24 * 60 * 60 * 1000).toISOString(),
      end_date: new Date(oneYearAgo.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString(),
      tags: ['chapter', 'concept', 'inspiration', 'planning', 'vision'],
      metadata: { layer: 'chapter', layer_order: 6 },
      created_at: new Date(oneYearAgo.getTime() + 45 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date(oneYearAgo.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString(),
      children: []
    },

    // ============================================
    // LEVEL 7: SCENE - "The Midnight Inspiration Scene"
    // ============================================
    {
      id: 'scene-midnight-inspiration',
      user_id: 'mock-user',
      title: 'The Midnight Inspiration Scene',
      description: 'A specific scene within the concept chapter—that late night when the EP concept fully crystallized. Sitting in my home studio at 2am, working with Alex Rivera, everything clicked into place. The concept would explore my transformation from tech to creative work, the relationships that shaped me, and finding my authentic voice.',
      timeline_type: 'custom',
      parent_id: 'chapter-concept',
      start_date: new Date(oneYearAgo.getTime() + 50 * 24 * 60 * 60 * 1000).toISOString(),
      end_date: new Date(oneYearAgo.getTime() + 50 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000).toISOString(), // 3 hours later
      tags: ['scene', 'inspiration', 'late-night', 'breakthrough', 'moment'],
      metadata: { layer: 'scene', layer_order: 7 },
      created_at: new Date(oneYearAgo.getTime() + 50 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date(oneYearAgo.getTime() + 50 * 24 * 60 * 60 * 1000).toISOString(),
      children: []
    },

    // ============================================
    // LEVEL 8: ACTION - "Recorded the First Demo"
    // ============================================
    {
      id: 'action-recorded-first-demo',
      user_id: 'mock-user',
      title: 'Recorded the First Demo',
      description: 'A single action within the midnight inspiration scene—the moment I recorded the first demo track. This was the concrete step that transformed the idea into reality.',
      timeline_type: 'custom',
      parent_id: 'scene-midnight-inspiration',
      start_date: new Date(oneYearAgo.getTime() + 50 * 24 * 60 * 60 * 1000 + 1 * 60 * 60 * 1000).toISOString(),
      end_date: new Date(oneYearAgo.getTime() + 50 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000).toISOString(), // 1 hour later
      tags: ['action', 'recording', 'demo', 'first-step', 'creation'],
      metadata: { layer: 'action', layer_order: 8 },
      created_at: new Date(oneYearAgo.getTime() + 50 * 24 * 60 * 60 * 1000 + 1 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date(oneYearAgo.getTime() + 50 * 24 * 60 * 60 * 1000 + 1 * 60 * 60 * 1000).toISOString(),
      children: []
    },

    // ============================================
    // LEVEL 9: MICROACTION - "Pressed Record"
    // ============================================
    {
      id: 'microaction-pressed-record',
      user_id: 'mock-user',
      title: 'Pressed Record',
      description: 'The smallest granular action—the exact moment I pressed the record button. This microaction captures the finest detail of that transformative moment.',
      timeline_type: 'custom',
      parent_id: 'action-recorded-first-demo',
      start_date: new Date(oneYearAgo.getTime() + 50 * 24 * 60 * 60 * 1000 + 1 * 60 * 60 * 1000 + 5 * 60 * 1000).toISOString(),
      end_date: new Date(oneYearAgo.getTime() + 50 * 24 * 60 * 60 * 1000 + 1 * 60 * 60 * 1000 + 5 * 60 * 1000 + 30 * 1000).toISOString(), // 30 seconds later
      tags: ['microaction', 'record', 'button', 'moment', 'detail'],
      metadata: { layer: 'microaction', layer_order: 9 },
      created_at: new Date(oneYearAgo.getTime() + 50 * 24 * 60 * 60 * 1000 + 1 * 60 * 60 * 1000 + 5 * 60 * 1000).toISOString(),
      updated_at: new Date(oneYearAgo.getTime() + 50 * 24 * 60 * 60 * 1000 + 1 * 60 * 60 * 1000 + 5 * 60 * 1000).toISOString(),
      children: []
    },

    // ============================================
    // ADDITIONAL BRANCHES FOR COMPLETE HIERARCHY
    // ============================================

    // Another Epoch under the same Mythos
    {
      id: 'epoch-early-foundation',
      user_id: 'mock-user',
      title: 'The Early Foundation Years',
      description: 'The foundational epoch before the transformation—my college years and early career where I built the skills and relationships that would shape everything to come.',
      timeline_type: 'life_era',
      parent_id: 'mythos-quest-self-discovery',
      start_date: fiveYearsAgo.toISOString(),
      end_date: threeYearsAgo.toISOString(),
      tags: ['epoch', 'foundation', 'college', 'early-career', 'learning'],
      metadata: { layer: 'epoch', layer_order: 2 },
      created_at: fiveYearsAgo.toISOString(),
      updated_at: threeYearsAgo.toISOString(),
      children: []
    },

    // Another Era under the Transformation Epoch (OVERLAPS with Creative Renaissance)
    {
      id: 'era-career-acceleration',
      user_id: 'mock-user',
      title: 'The Career Acceleration Era',
      description: 'An era focused on professional growth and career advancement. This period saw rapid skill development, promotions, and establishing myself in my field. This era overlaps with the Creative Renaissance as I balanced both career and creative pursuits.',
      timeline_type: 'work',
      parent_id: 'epoch-transformation-years',
      start_date: new Date(threeYearsAgo.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      end_date: new Date(oneYearAgo.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      tags: ['era', 'career', 'professional', 'growth', 'acceleration'],
      metadata: { layer: 'era', layer_order: 3 },
      created_at: new Date(threeYearsAgo.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date(oneYearAgo.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      children: []
    },

    // Another Era under the Transformation Epoch (OVERLAPS with both Creative Renaissance and Career Acceleration)
    {
      id: 'era-photography-journey',
      user_id: 'mock-user',
      title: 'The Photography Journey Era',
      description: 'An era where I explored photography as a creative outlet. This overlapped with both my music production and career growth, creating a rich period of multi-faceted development.',
      timeline_type: 'custom',
      parent_id: 'epoch-transformation-years',
      start_date: new Date(twoYearsAgo.getTime() + 45 * 24 * 60 * 60 * 1000).toISOString(), // Overlaps with Creative Renaissance
      end_date: null,
      tags: ['era', 'photography', 'creative', 'art', 'visual'],
      metadata: { layer: 'era', layer_order: 3 },
      created_at: new Date(twoYearsAgo.getTime() + 45 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: now.toISOString(),
      children: []
    },

    // Another Saga under Career Acceleration Era
    {
      id: 'saga-startup-journey',
      user_id: 'mock-user',
      title: 'The Startup Journey Saga',
      description: 'A long narrative arc about joining a startup and growing with it. From early employee to team lead, this saga captures the complete startup experience.',
      timeline_type: 'work',
      parent_id: 'era-career-acceleration',
      start_date: new Date(twoYearsAgo.getTime() + 120 * 24 * 60 * 60 * 1000).toISOString(),
      end_date: new Date(oneYearAgo.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString(),
      tags: ['saga', 'startup', 'career', 'growth', 'leadership'],
      metadata: { layer: 'saga', layer_order: 4 },
      created_at: new Date(twoYearsAgo.getTime() + 120 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date(oneYearAgo.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString(),
      children: []
    },

    // Another Saga under Career Acceleration Era (OVERLAPS with Startup Journey)
    {
      id: 'saga-freelance-adventures',
      user_id: 'mock-user',
      title: 'The Freelance Adventures Saga',
      description: 'A parallel saga about taking on freelance projects while working at the startup. This overlapped with the startup journey, creating a period of intense professional growth.',
      timeline_type: 'work',
      parent_id: 'era-career-acceleration',
      start_date: new Date(twoYearsAgo.getTime() + 150 * 24 * 60 * 60 * 1000).toISOString(), // Overlaps with startup journey
      end_date: new Date(oneYearAgo.getTime() - 45 * 24 * 60 * 60 * 1000).toISOString(),
      tags: ['saga', 'freelance', 'career', 'projects', 'independence'],
      metadata: { layer: 'saga', layer_order: 4 },
      created_at: new Date(twoYearsAgo.getTime() + 150 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date(oneYearAgo.getTime() - 45 * 24 * 60 * 60 * 1000).toISOString(),
      children: []
    },

    // Another Saga under Creative Renaissance Era (OVERLAPS with Music Production)
    {
      id: 'saga-writing-journey',
      user_id: 'mock-user',
      title: 'The Writing Journey Saga',
      description: 'A saga about rediscovering my love for writing. This ran parallel to the music production saga, both part of the creative renaissance.',
      timeline_type: 'custom',
      parent_id: 'era-creative-renaissance',
      start_date: new Date(twoYearsAgo.getTime() + 100 * 24 * 60 * 60 * 1000).toISOString(), // Overlaps with music production
      end_date: null,
      tags: ['saga', 'writing', 'creative', 'literature', 'storytelling'],
      metadata: { layer: 'saga', layer_order: 4 },
      created_at: new Date(twoYearsAgo.getTime() + 100 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: now.toISOString(),
      children: []
    },

    // Another Arc under Startup Saga
    {
      id: 'arc-product-launch',
      user_id: 'mock-user',
      title: 'The Product Launch Arc',
      description: 'A story arc about launching our first major product. This arc follows the journey from planning to execution to launch day.',
      timeline_type: 'work',
      parent_id: 'saga-startup-journey',
      start_date: new Date(oneYearAgo.getTime() - 120 * 24 * 60 * 60 * 1000).toISOString(),
      end_date: new Date(oneYearAgo.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      tags: ['arc', 'product', 'launch', 'startup', 'milestone'],
      metadata: { layer: 'arc', layer_order: 5 },
      created_at: new Date(oneYearAgo.getTime() - 120 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date(oneYearAgo.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      children: []
    },

    // Another Arc under Startup Saga (OVERLAPS with Product Launch)
    {
      id: 'arc-team-building',
      user_id: 'mock-user',
      title: 'The Team Building Arc',
      description: 'An arc about building and leading a team at the startup. This overlapped with the product launch, as we were growing the team while shipping the product.',
      timeline_type: 'work',
      parent_id: 'saga-startup-journey',
      start_date: new Date(oneYearAgo.getTime() - 100 * 24 * 60 * 60 * 1000).toISOString(), // Overlaps with product launch
      end_date: new Date(oneYearAgo.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString(),
      tags: ['arc', 'team', 'leadership', 'startup', 'management'],
      metadata: { layer: 'arc', layer_order: 5 },
      created_at: new Date(oneYearAgo.getTime() - 100 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date(oneYearAgo.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString(),
      children: []
    },

    // Another Arc under Music Production Saga (OVERLAPS with First Album Arc)
    {
      id: 'arc-live-performances',
      user_id: 'mock-user',
      title: 'The Live Performances Arc',
      description: 'An arc about performing my music live. This ran parallel to creating the album, as I was testing songs in front of audiences while recording.',
      timeline_type: 'skill',
      parent_id: 'saga-music-production',
      start_date: new Date(oneYearAgo.getTime() + 20 * 24 * 60 * 60 * 1000).toISOString(), // Overlaps with first album
      end_date: null,
      tags: ['arc', 'live', 'performance', 'music', 'stage'],
      metadata: { layer: 'arc', layer_order: 5 },
      created_at: new Date(oneYearAgo.getTime() + 20 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: now.toISOString(),
      children: []
    },

    // Another Chapter under Product Launch Arc
    {
      id: 'chapter-launch-day',
      user_id: 'mock-user',
      title: 'Chapter 3: Launch Day',
      description: 'The chapter covering launch day itself—the culmination of months of work. This chapter captures the excitement, nerves, and celebration.',
      timeline_type: 'work',
      parent_id: 'arc-product-launch',
      start_date: new Date(oneYearAgo.getTime() - 35 * 24 * 60 * 60 * 1000).toISOString(),
      end_date: new Date(oneYearAgo.getTime() - 34 * 24 * 60 * 60 * 1000).toISOString(),
      tags: ['chapter', 'launch', 'milestone', 'celebration', 'achievement'],
      metadata: { layer: 'chapter', layer_order: 6 },
      created_at: new Date(oneYearAgo.getTime() - 35 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date(oneYearAgo.getTime() - 34 * 24 * 60 * 60 * 1000).toISOString(),
      children: []
    },

    // Another Scene under Launch Day Chapter
    {
      id: 'scene-launch-announcement',
      user_id: 'mock-user',
      title: 'The Launch Announcement Scene',
      description: 'A specific scene within launch day—the moment we announced the product to the world. The team gathered, we hit publish, and watched the reactions pour in.',
      timeline_type: 'work',
      parent_id: 'chapter-launch-day',
      start_date: new Date(oneYearAgo.getTime() - 35 * 24 * 60 * 60 * 1000 + 10 * 60 * 60 * 1000).toISOString(), // 10am
      end_date: new Date(oneYearAgo.getTime() - 35 * 24 * 60 * 60 * 1000 + 11 * 60 * 60 * 1000).toISOString(), // 11am
      tags: ['scene', 'announcement', 'launch', 'team', 'moment'],
      metadata: { layer: 'scene', layer_order: 7 },
      created_at: new Date(oneYearAgo.getTime() - 35 * 24 * 60 * 60 * 1000 + 10 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date(oneYearAgo.getTime() - 35 * 24 * 60 * 60 * 1000 + 10 * 60 * 60 * 1000).toISOString(),
      children: []
    },

    // Another Action under Launch Announcement Scene
    {
      id: 'action-pressed-publish',
      user_id: 'mock-user',
      title: 'Pressed Publish',
      description: 'A single action within the launch announcement scene—the moment I pressed the publish button. This was the action that made it all real.',
      timeline_type: 'work',
      parent_id: 'scene-launch-announcement',
      start_date: new Date(oneYearAgo.getTime() - 35 * 24 * 60 * 60 * 1000 + 10 * 30 * 60 * 1000).toISOString(), // 10:30am
      end_date: new Date(oneYearAgo.getTime() - 35 * 24 * 60 * 60 * 1000 + 10 * 30 * 60 * 1000 + 2 * 60 * 1000).toISOString(), // 2 minutes later
      tags: ['action', 'publish', 'button', 'launch', 'decision'],
      metadata: { layer: 'action', layer_order: 8 },
      created_at: new Date(oneYearAgo.getTime() - 35 * 24 * 60 * 60 * 1000 + 10 * 30 * 60 * 1000).toISOString(),
      updated_at: new Date(oneYearAgo.getTime() - 35 * 24 * 60 * 60 * 1000 + 10 * 30 * 60 * 1000).toISOString(),
      children: []
    },

    // Another MicroAction under Pressed Publish Action
    {
      id: 'microaction-clicked-mouse',
      user_id: 'mock-user',
      title: 'Clicked the Mouse',
      description: 'The smallest granular action—the exact moment my finger clicked the mouse button to publish. This microaction captures the finest detail of that life-changing click.',
      timeline_type: 'work',
      parent_id: 'action-pressed-publish',
      start_date: new Date(oneYearAgo.getTime() - 35 * 24 * 60 * 60 * 1000 + 10 * 30 * 60 * 1000 + 1 * 60 * 1000).toISOString(),
      end_date: new Date(oneYearAgo.getTime() - 35 * 24 * 60 * 60 * 1000 + 10 * 30 * 60 * 1000 + 1 * 60 * 1000 + 1 * 1000).toISOString(), // 1 second later
      tags: ['microaction', 'click', 'mouse', 'moment', 'detail'],
      metadata: { layer: 'microaction', layer_order: 9 },
      created_at: new Date(oneYearAgo.getTime() - 35 * 24 * 60 * 60 * 1000 + 10 * 30 * 60 * 1000 + 1 * 60 * 1000).toISOString(),
      updated_at: new Date(oneYearAgo.getTime() - 35 * 24 * 60 * 60 * 1000 + 10 * 30 * 60 * 1000 + 1 * 60 * 1000).toISOString(),
      children: []
    },

    // ============================================
    // ADDITIONAL ROOT TIMELINES (for variety)
    // ============================================

    // Fitness Transformation Timeline (separate from hierarchy)
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
  
  // Timeline-specific memory templates with entries for each hierarchy level
  const timelineMemoryTemplates: Record<string, Array<{ content: string; precision: TimePrecision; isRange: boolean; durationDays?: number }>> = {
    'mythos-quest-self-discovery': [
      { content: 'Began my quest for self-discovery. Realized I needed to understand who I truly am and what I want from life. This is the beginning of my grand narrative.', precision: 'day', isRange: false },
      { content: 'Reflecting on my journey so far. The quest for self-discovery has led me through many transformations, each one teaching me something new about myself.', precision: 'month', isRange: true, durationDays: 30 }
    ],
    'epoch-transformation-years': [
      { content: 'Entered the transformation years. This epoch marks a fundamental shift in who I am—from uncertainty to purpose, from following to leading.', precision: 'day', isRange: false },
      { content: 'The transformation continues. Each day brings new insights and growth. I\'m becoming the person I was meant to be.', precision: 'month', isRange: true, durationDays: 30 }
    ],
    'era-creative-renaissance': [
      { content: 'The creative renaissance begins. Rediscovering my passion for art, music, and storytelling after years of focusing solely on career.', precision: 'day', isRange: false },
      { content: 'The creative renaissance is in full swing. Creating daily, feeling inspired, and reconnecting with my artistic side.', precision: 'month', isRange: true, durationDays: 30 }
    ],
    'saga-music-production': [
      { content: 'The music production saga begins. Bought my first MIDI controller and started learning music production. This is going to be an incredible journey.', precision: 'day', isRange: false },
      { content: 'Making steady progress in the music production saga. Learning new techniques, creating beats, and finding my sound.', precision: 'day', isRange: false },
      { content: 'Completed my first track in the music production saga. It\'s rough but I\'m proud. This journey is teaching me so much about creativity and persistence.', precision: 'day', isRange: false }
    ],
    'arc-first-album': [
      { content: 'The first album arc begins. Starting work on my debut album. This is a major creative project that will push me to new heights.', precision: 'day', isRange: false },
      { content: 'Making progress on the album arc. Writing songs, recording demos, and refining my sound. Each day brings new ideas and challenges.', precision: 'day', isRange: false }
    ],
    'chapter-concept': [
      { content: 'Chapter 1: The Concept begins. Working on the initial idea for the album. Sketching out themes, sounds, and the overall vision.', precision: 'day', isRange: false },
      { content: 'The concept is taking shape. The vision for the album is becoming clearer. Excited to see where this chapter leads.', precision: 'day', isRange: false }
    ],
    'scene-midnight-inspiration': [
      { content: 'The midnight inspiration scene. Sitting in my studio at 2am, everything clicked into place. The album concept fully crystallized in that moment.', precision: 'exact', isRange: false }
    ],
    'action-recorded-first-demo': [
      { content: 'Recorded the first demo. Transformed the idea into reality by laying down the initial track. This action made everything real.', precision: 'exact', isRange: false }
    ],
    'microaction-pressed-record': [
      { content: 'Pressed record. That exact moment when my finger hit the button. The smallest action that started it all.', precision: 'exact', isRange: false }
    ],
    'epoch-early-foundation': [
      { content: 'The early foundation years. College and early career where I built the skills and relationships that would shape everything to come.', precision: 'day', isRange: false }
    ],
    'era-career-acceleration': [
      { content: 'The career acceleration era begins. Focusing on professional growth and rapid skill development. This era is about establishing myself in my field.', precision: 'day', isRange: false },
      { content: 'Career acceleration continues. Promotions, new responsibilities, and growing influence. This era is transforming my professional life.', precision: 'month', isRange: true, durationDays: 30 }
    ],
    'saga-startup-journey': [
      { content: 'The startup journey saga begins. Joined a startup as an early employee. This saga will capture my complete startup experience.', precision: 'day', isRange: false },
      { content: 'Growing with the startup. From early employee to team lead. This saga is teaching me about leadership, product, and building something from the ground up.', precision: 'month', isRange: true, durationDays: 30 }
    ],
    'arc-product-launch': [
      { content: 'The product launch arc begins. Planning our first major product launch. This arc will follow the journey from concept to launch day.', precision: 'day', isRange: false },
      { content: 'Product launch arc in progress. Working through challenges, making decisions, and building toward launch day. The excitement is building.', precision: 'day', isRange: false }
    ],
    'chapter-launch-day': [
      { content: 'Chapter 3: Launch Day. The culmination of months of work. Today we launch our product to the world. Excited, nervous, and ready.', precision: 'day', isRange: false }
    ],
    'scene-launch-announcement': [
      { content: 'The launch announcement scene. Team gathered, we hit publish, and watched the reactions pour in. This was the moment we\'d been working toward.', precision: 'exact', isRange: false }
    ],
    'action-pressed-publish': [
      { content: 'Pressed publish. The action that made it all real. After months of work, we\'re finally live. This is a moment I\'ll never forget.', precision: 'exact', isRange: false }
    ],
    'microaction-clicked-mouse': [
      { content: 'Clicked the mouse. That exact moment my finger clicked the button. The smallest action that launched our product to the world.', precision: 'exact', isRange: false }
    ],
    'timeline-fitness-1': [
      { content: 'Started my fitness transformation journey. Set a goal to work out 4 times a week and track my progress.', precision: 'day', isRange: false },
      { content: 'Completed my first week of consistent workouts. Feeling stronger already and more energized throughout the day.', precision: 'day', isRange: false },
      { content: 'Hit a new personal record on deadlifts today. 225lbs! The hard work is paying off.', precision: 'day', isRange: false },
      { content: 'Lost 10 pounds in the first month. More importantly, I feel healthier and more confident.', precision: 'month', isRange: true, durationDays: 30 }
    ],
    'timeline-webdev-1': [
      { content: 'Started learning web development. Began with HTML and CSS basics. Everything is new and exciting!', precision: 'day', isRange: false },
      { content: 'Built my first website - a simple portfolio page. It\'s not perfect but it\'s mine and I\'m proud of it.', precision: 'day', isRange: false },
      { content: 'Completed my first React tutorial. Components, props, state - it\'s all starting to click.', precision: 'day', isRange: false }
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
