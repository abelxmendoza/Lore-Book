/**
 * Curated demo skills — realistic profiles users actually care about in the Skills book.
 */
import type { Skill, SkillCategory } from '../types/skill';

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

function xpForLevel(level: number): number {
  return Math.floor(100 * Math.pow(1.5, level - 1));
}

function makeSkill(partial: Skill): Skill {
  return partial;
}

type SkillSeed = {
  id: string;
  skill_name: string;
  skill_category: SkillCategory;
  current_level: number;
  description: string;
  startedDaysAgo: number;
  practicedDaysAgo: number;
  practice_count: number;
  auto_detected?: boolean;
  is_active?: boolean;
  confidence_score?: number;
  monetization?: 'paid' | 'potentially_paid' | 'hobby_only';
  trajectory?: 'improving' | 'stable' | 'declining' | 'unknown';
  proficiency?: number;
  enjoyment?: number;
  usage_frequency?: 'daily' | 'weekly' | 'monthly' | 'rarely';
  skill_type?: string;
  location?: { id: string; name: string };
  why?: string;
  teacher?: { id: string; name: string };
};

function skillFromSeed(seed: SkillSeed): Skill {
  const levelBase = xpForLevel(seed.current_level);
  const total_xp = levelBase + seed.practice_count * 12 + seed.current_level * 35;
  const nextThreshold = xpForLevel(seed.current_level + 1);
  const xp_to_next_level = Math.max(80, nextThreshold - (total_xp - levelBase));

  const practicedAt = seed.location
    ? [
        {
          location_id: seed.location.id,
          location_name: seed.location.name,
          practice_count: seed.practice_count,
          last_practiced: daysAgo(seed.practicedDaysAgo),
          evidence_entry_ids: [] as string[],
        },
      ]
    : undefined;

  return makeSkill({
    id: seed.id,
    user_id: 'mock-user',
    skill_name: seed.skill_name,
    skill_category: seed.skill_category,
    current_level: seed.current_level,
    total_xp,
    xp_to_next_level,
    description: seed.description,
    first_mentioned_at: daysAgo(seed.startedDaysAgo),
    last_practiced_at: daysAgo(seed.practicedDaysAgo),
    practice_count: seed.practice_count,
    auto_detected: seed.auto_detected ?? true,
    confidence_score: seed.confidence_score ?? 0.82,
    is_active: seed.is_active ?? true,
    metadata: {
      skill_profile: {
        skill_type: seed.skill_type ?? seed.skill_category,
        monetization: seed.monetization ?? 'hobby_only',
        proficiency: seed.proficiency ?? Math.min(95, seed.current_level * 11 + 18),
        enjoyment: seed.enjoyment ?? 65 + (seed.current_level % 5) * 5,
        usage_frequency: seed.usage_frequency ?? (seed.practice_count > 50 ? 'weekly' : 'monthly'),
        trajectory: seed.trajectory ?? 'improving',
        origin_story: seed.why,
      },
      skill_details: {
        years_practiced: Math.max(0.5, seed.startedDaysAgo / 365),
        ...(seed.why
          ? {
              why_started: {
                reason: seed.why,
                entry_id: 'demo',
                extracted_at: daysAgo(seed.startedDaysAgo),
              },
            }
          : {}),
        ...(seed.teacher
          ? {
              learned_from: [
                {
                  character_id: seed.teacher.id,
                  character_name: seed.teacher.name,
                  relationship_type: 'peer' as const,
                  first_mentioned: daysAgo(seed.startedDaysAgo),
                  evidence_entry_ids: [],
                },
              ],
            }
          : {}),
        ...(practicedAt ? { practiced_at: practicedAt } : {}),
      },
    },
    created_at: daysAgo(seed.startedDaysAgo),
    updated_at: daysAgo(seed.practicedDaysAgo),
  });
}

const curatedSkillBookDemoSkills: Skill[] = [
  makeSkill({
    id: 'skill-demo-ros2',
    user_id: 'mock-user',
    skill_name: 'ROS 2',
    skill_category: 'technical',
    current_level: 11,
    total_xp: 4800,
    xp_to_next_level: 620,
    description: 'Robot Operating System 2 — nodes, topics, launch files, and simulation workflows.',
    first_mentioned_at: daysAgo(450),
    last_practiced_at: daysAgo(1),
    practice_count: 127,
    auto_detected: true,
    confidence_score: 0.94,
    is_active: true,
    metadata: {
      skill_profile: {
        skill_type: 'technical',
        monetization: 'potentially_paid',
        proficiency: 88,
        enjoyment: 82,
        usage_frequency: 'weekly',
        trajectory: 'improving',
        category_domain: 'Robotics',
        category_subdomain: 'Software',
        story_summary:
          'Abel learned ROS 2 while building Omega-1 and continued using it while pursuing robotics careers.',
        origin_story: 'Picked up ROS 2 Jazzy to drive Omega-1 from prototype to demo-ready.',
        first_learned_context: 'Omega-1 platform bring-up',
        related_projects: ['Omega-1', 'LoreBook'],
        related_jobs: ['CSUF Robotics Work', 'Robotics career search'],
        related_skill_names: ['C++', 'Linux', 'Gazebo', 'Robotics'],
        evidence_score: 94,
        proficiency_breakdown: { knowledge: 92, experience: 85, recency: 100, confidence: 94 },
        ai_insights: [
          'ROS 2 appears to be one of your strongest technical identities.',
          'Robotics-related skills have steadily increased while web-development skills have remained stable.',
          'Most career opportunities discussed during 2026 connect directly to ROS 2, Linux, and C++.',
          'This skill frequently appears alongside autonomy, drones, and aerospace topics.',
        ],
        evidence: [
          {
            text: 'I built Omega-1 using ROS 2 Jazzy',
            source_type: 'chat',
            confidence: 0.08,
            captured_at: daysAgo(12),
          },
        ],
      },
      skill_details: {
        years_practiced: 1.2,
        why_started: {
          reason: 'Needed a real middleware stack to make Omega-1 move, stream video, and simulate in Gazebo.',
          entry_id: 'demo-ros',
          extracted_at: daysAgo(450),
        },
        learned_when: { date: daysAgo(450), entry_id: 'demo-ros', context: 'Omega-1 platform bring-up' },
        learning_timeline: [
          { date: daysAgo(450), event: 'Started learning ROS 2', entry_id: 'tl-1' },
          { date: daysAgo(380), event: 'Built Omega-1', entry_id: 'tl-2' },
          { date: daysAgo(300), event: 'Added camera streaming', entry_id: 'tl-3' },
          { date: daysAgo(220), event: 'Integrated Gazebo', entry_id: 'tl-4' },
          { date: daysAgo(120), event: 'Applied to robotics jobs', entry_id: 'tl-5' },
        ],
        learned_from: [
          {
            character_id: 'prof-smith',
            character_name: 'Professor Smith',
            relationship_type: 'teacher',
            first_mentioned: daysAgo(400),
            evidence_entry_ids: [],
          },
        ],
        practiced_with: [
          { character_id: 'gary', character_name: 'Gary', practice_count: 18, last_practiced: daysAgo(14), evidence_entry_ids: [] },
          { character_id: 'jeff', character_name: 'Jeff', practice_count: 11, last_practiced: daysAgo(30), evidence_entry_ids: [] },
        ],
        practiced_at: [
          { location_id: 'csuf-lab', location_name: 'CSUF Robotics Lab', practice_count: 42, last_practiced: daysAgo(20), evidence_entry_ids: [] },
        ],
        arcs: [{ arc_id: 'arc-robotics', arc_title: 'Robotics transition', start_date: daysAgo(450) }],
        sagas: [{ saga_id: 'saga-omega', saga_title: 'Omega-1 build', start_date: daysAgo(380) }],
      },
    },
    created_at: daysAgo(450),
    updated_at: daysAgo(1),
  }),
  makeSkill({
    id: 'skill-demo-music-production',
    user_id: 'mock-user',
    skill_name: 'Music Production',
    skill_category: 'creative',
    current_level: 8,
    total_xp: 2450,
    xp_to_next_level: 180,
    description: 'Building beats and finishing tracks in your home studio — your main creative outlet.',
    first_mentioned_at: daysAgo(540),
    last_practiced_at: daysAgo(3),
    practice_count: 86,
    auto_detected: true,
    confidence_score: 0.94,
    is_active: true,
    metadata: {
      skill_profile: {
        skill_type: 'creative',
        monetization: 'potentially_paid',
        proficiency: 78,
        enjoyment: 92,
        usage_frequency: 'weekly',
        trajectory: 'improving',
        origin_story: 'Started after Alex Rivera showed you the basics of a DAW.',
        related_projects: ['First album demo', 'Atlas Notes theme'],
      },
      skill_details: {
        years_practiced: 1.5,
        learned_when: { date: daysAgo(540), context: 'First session with Alex Rivera' },
        why_started: {
          reason: 'Wanted a creative outlet that felt yours — not just work code.',
          entry_id: 'demo',
          extracted_at: daysAgo(540),
        },
        learned_from: [
          { character_id: 'dummy-3', character_name: 'Alex Rivera', relationship_type: 'teacher', first_mentioned: daysAgo(540), evidence_entry_ids: [] },
        ],
        practiced_with: [
          { character_id: 'alex-bf', character_name: 'Alex', practice_count: 12, last_practiced: daysAgo(10), evidence_entry_ids: [] },
        ],
        learned_at: [{ location_id: 'dummy-loc-3', location_name: 'Home Studio', first_mentioned: daysAgo(540), evidence_entry_ids: [] }],
        practiced_at: [
          { location_id: 'dummy-loc-3', location_name: 'Home Studio', practice_count: 72, last_practiced: daysAgo(3), evidence_entry_ids: [] },
        ],
        arcs: [{ arc_id: 'ch-creative', arc_title: 'Creative Renaissance', start_date: daysAgo(400) }],
      },
    },
    created_at: daysAgo(540),
    updated_at: daysAgo(3),
  }),
  makeSkill({
    id: 'skill-demo-react',
    user_id: 'mock-user',
    skill_name: 'React Development',
    skill_category: 'technical',
    current_level: 9,
    total_xp: 3200,
    xp_to_next_level: 420,
    description: 'Day-to-day UI work — components, state, and shipping features at Novara.',
    first_mentioned_at: daysAgo(800),
    last_practiced_at: daysAgo(1),
    practice_count: 210,
    auto_detected: true,
    confidence_score: 0.96,
    is_active: true,
    metadata: {
      skill_profile: {
        skill_type: 'technical',
        monetization: 'paid',
        proficiency: 85,
        enjoyment: 70,
        usage_frequency: 'daily',
        trajectory: 'improving',
        origin_story: 'Self-taught through side projects, then daily product work.',
        related_jobs: ['Novara HQ'],
        related_projects: ['LoreBook', 'Atlas Notes'],
      },
      skill_details: {
        years_practiced: 2,
        why_started: { reason: 'Needed to ship your own ideas without waiting on a team.', entry_id: 'demo', extracted_at: daysAgo(800) },
        practiced_at: [
          { location_id: 'dummy-loc-1', location_name: 'Novara HQ', practice_count: 120, last_practiced: daysAgo(1), evidence_entry_ids: [] },
          { location_id: 'dummy-loc-3', location_name: 'Home Studio', practice_count: 45, last_practiced: daysAgo(2), evidence_entry_ids: [] },
        ],
      },
    },
    created_at: daysAgo(800),
    updated_at: daysAgo(1),
  }),
  makeSkill({
    id: 'skill-demo-writing',
    user_id: 'mock-user',
    skill_name: 'Creative Writing',
    skill_category: 'creative',
    current_level: 6,
    total_xp: 1680,
    xp_to_next_level: 220,
    description: 'Morning pages, story drafts, and lyrics — mostly at Ritual Coffee.',
    first_mentioned_at: daysAgo(600),
    last_practiced_at: daysAgo(4),
    practice_count: 54,
    auto_detected: true,
    confidence_score: 0.88,
    is_active: true,
    metadata: {
      skill_profile: {
        skill_type: 'creative',
        monetization: 'hobby_only',
        proficiency: 62,
        enjoyment: 88,
        usage_frequency: 'weekly',
        trajectory: 'improving',
        origin_story: 'Sarah Chen encouraged you to keep a daily notebook.',
      },
      skill_details: {
        years_practiced: 1.5,
        why_started: { reason: 'Processing life through words felt clearer than talking it out.', entry_id: 'demo', extracted_at: daysAgo(600) },
        practiced_with: [
          { character_id: 'dummy-1', character_name: 'Sarah Chen', practice_count: 28, last_practiced: daysAgo(7), evidence_entry_ids: [] },
        ],
        practiced_at: [
          { location_id: 'dummy-loc-4', location_name: 'Ritual Coffee', practice_count: 38, last_practiced: daysAgo(4), evidence_entry_ids: [] },
        ],
      },
    },
    created_at: daysAgo(600),
    updated_at: daysAgo(4),
  }),
  makeSkill({
    id: 'skill-demo-bjj',
    user_id: 'mock-user',
    skill_name: 'Brazilian Jiu-Jitsu',
    skill_category: 'physical',
    current_level: 4,
    total_xp: 890,
    xp_to_next_level: 310,
    description: 'Gi and no-gi classes — stress relief and staying strong.',
    first_mentioned_at: daysAgo(200),
    last_practiced_at: daysAgo(2),
    practice_count: 42,
    auto_detected: false,
    confidence_score: 0.91,
    is_active: true,
    metadata: {
      skill_profile: {
        skill_type: 'physical',
        monetization: 'hobby_only',
        proficiency: 48,
        enjoyment: 75,
        usage_frequency: 'weekly',
        trajectory: 'improving',
        origin_story: 'Started after Ethan Walker invited you to an open mat.',
      },
      skill_details: {
        why_started: { reason: 'Wanted something physical that also taught patience.', entry_id: 'demo', extracted_at: daysAgo(200) },
        learned_from: [
          { character_id: 'dummy-9', character_name: 'Ethan Walker', relationship_type: 'peer', first_mentioned: daysAgo(200), evidence_entry_ids: [] },
        ],
        practiced_at: [
          { location_id: 'dummy-loc-6', location_name: 'Mission Climbing Gym', practice_count: 35, last_practiced: daysAgo(2), evidence_entry_ids: [] },
        ],
      },
    },
    created_at: daysAgo(200),
    updated_at: daysAgo(2),
  }),
  makeSkill({
    id: 'skill-demo-public-speaking',
    user_id: 'mock-user',
    skill_name: 'Public Speaking',
    skill_category: 'social',
    current_level: 5,
    total_xp: 1120,
    xp_to_next_level: 280,
    description: 'Stand-ups, demos, and the occasional conference talk.',
    first_mentioned_at: daysAgo(450),
    last_practiced_at: daysAgo(14),
    practice_count: 18,
    auto_detected: true,
    confidence_score: 0.72,
    is_active: true,
    metadata: {
      skill_profile: {
        skill_type: 'professional',
        monetization: 'paid',
        proficiency: 55,
        enjoyment: 45,
        usage_frequency: 'monthly',
        trajectory: 'improving',
      },
      skill_details: {
        why_started: { reason: 'Career growth required presenting ideas, not just building them.', entry_id: 'demo', extracted_at: daysAgo(450) },
        practiced_at: [
          { location_id: 'dummy-loc-1', location_name: 'Novara HQ', practice_count: 10, last_practiced: daysAgo(30), evidence_entry_ids: [] },
        ],
      },
    },
    created_at: daysAgo(450),
    updated_at: daysAgo(14),
  }),
  makeSkill({
    id: 'skill-demo-cooking',
    user_id: 'mock-user',
    skill_name: 'Home Cooking',
    skill_category: 'practical',
    current_level: 5,
    total_xp: 1050,
    xp_to_next_level: 350,
    description: 'Weeknight meals, meal prep, and hosting friends.',
    first_mentioned_at: daysAgo(900),
    last_practiced_at: daysAgo(1),
    practice_count: 120,
    auto_detected: false,
    confidence_score: 0.85,
    is_active: true,
    metadata: {
      skill_profile: {
        skill_type: 'hobby',
        monetization: 'hobby_only',
        proficiency: 58,
        enjoyment: 80,
        usage_frequency: 'daily',
        trajectory: 'stable',
      },
      skill_details: {
        why_started: { reason: 'Takeout got expensive — and cooking became a way to unwind.', entry_id: 'demo', extracted_at: daysAgo(900) },
        practiced_at: [
          { location_id: 'dummy-loc-3', location_name: 'Home Studio', practice_count: 95, last_practiced: daysAgo(1), evidence_entry_ids: [] },
        ],
      },
    },
    created_at: daysAgo(900),
    updated_at: daysAgo(1),
  }),
  makeSkill({
    id: 'skill-demo-guitar',
    user_id: 'mock-user',
    skill_name: 'Guitar',
    skill_category: 'artistic',
    current_level: 3,
    total_xp: 520,
    xp_to_next_level: 180,
    description: 'Acoustic practice — chord progressions and campfire songs.',
    first_mentioned_at: daysAgo(300),
    last_practiced_at: daysAgo(8),
    practice_count: 22,
    auto_detected: false,
    confidence_score: 0.8,
    is_active: true,
    metadata: {
      skill_profile: {
        skill_type: 'hobby',
        monetization: 'hobby_only',
        proficiency: 35,
        enjoyment: 90,
        usage_frequency: 'weekly',
        trajectory: 'improving',
      },
      skill_details: {
        why_started: { reason: 'Wanted something tactile away from screens.', entry_id: 'demo', extracted_at: daysAgo(300) },
        practiced_at: [
          { location_id: 'dummy-loc-3', location_name: 'Home Studio', practice_count: 18, last_practiced: daysAgo(8), evidence_entry_ids: [] },
        ],
      },
    },
    created_at: daysAgo(300),
    updated_at: daysAgo(8),
  }),
  makeSkill({
    id: 'skill-demo-meditation',
    user_id: 'mock-user',
    skill_name: 'Meditation',
    skill_category: 'emotional',
    current_level: 4,
    total_xp: 780,
    xp_to_next_level: 420,
    description: '10-minute morning sits — focus and nervous-system reset.',
    first_mentioned_at: daysAgo(180),
    last_practiced_at: daysAgo(0),
    practice_count: 65,
    auto_detected: true,
    confidence_score: 0.87,
    is_active: true,
    metadata: {
      skill_profile: {
        skill_type: 'hobby',
        monetization: 'hobby_only',
        proficiency: 52,
        enjoyment: 70,
        usage_frequency: 'daily',
        trajectory: 'improving',
      },
      skill_details: {
        why_started: { reason: 'Burnout pushed you toward a daily calm ritual.', entry_id: 'demo', extracted_at: daysAgo(180) },
        practiced_at: [
          { location_id: 'dummy-loc-3', location_name: 'Home Studio', practice_count: 55, last_practiced: daysAgo(0), evidence_entry_ids: [] },
        ],
      },
    },
    created_at: daysAgo(180),
    updated_at: daysAgo(0),
  }),
  makeSkill({
    id: 'skill-demo-photography',
    user_id: 'mock-user',
    skill_name: 'Photography',
    skill_category: 'artistic',
    current_level: 4,
    total_xp: 640,
    xp_to_next_level: 560,
    description: 'Street and nature shots — mostly phone, sometimes mirrorless.',
    first_mentioned_at: daysAgo(400),
    last_practiced_at: daysAgo(6),
    practice_count: 28,
    auto_detected: true,
    confidence_score: 0.76,
    is_active: true,
    metadata: {
      skill_profile: {
        skill_type: 'hobby',
        monetization: 'potentially_paid',
        proficiency: 44,
        enjoyment: 85,
        usage_frequency: 'monthly',
        trajectory: 'stable',
      },
      skill_details: {
        practiced_at: [
          { location_id: 'dummy-loc-2', location_name: 'Golden Gate Park', practice_count: 14, last_practiced: daysAgo(6), evidence_entry_ids: [] },
          { location_id: 'dummy-loc-9', location_name: 'Marin Headlands Trail', practice_count: 8, last_practiced: daysAgo(20), evidence_entry_ids: [] },
        ],
      },
    },
    created_at: daysAgo(400),
    updated_at: daysAgo(6),
  }),
  makeSkill({
    id: 'skill-demo-spanish',
    user_id: 'mock-user',
    skill_name: 'Spanish',
    skill_category: 'intellectual',
    current_level: 3,
    total_xp: 410,
    xp_to_next_level: 290,
    description: 'Conversation practice and Duolingo streaks.',
    first_mentioned_at: daysAgo(120),
    last_practiced_at: daysAgo(1),
    practice_count: 40,
    auto_detected: false,
    confidence_score: 0.68,
    is_active: true,
    metadata: {
      skill_profile: {
        skill_type: 'hobby',
        monetization: 'hobby_only',
        proficiency: 30,
        enjoyment: 60,
        usage_frequency: 'daily',
        trajectory: 'improving',
      },
    },
    created_at: daysAgo(120),
    updated_at: daysAgo(1),
  }),
  makeSkill({
    id: 'skill-demo-running',
    user_id: 'mock-user',
    skill_name: 'Running',
    skill_category: 'physical',
    current_level: 5,
    total_xp: 980,
    xp_to_next_level: 420,
    description: 'Easy miles and weekend long runs along the waterfront.',
    first_mentioned_at: daysAgo(365),
    last_practiced_at: daysAgo(2),
    practice_count: 75,
    auto_detected: true,
    confidence_score: 0.9,
    is_active: true,
    metadata: {
      skill_profile: {
        skill_type: 'physical',
        monetization: 'hobby_only',
        proficiency: 60,
        enjoyment: 72,
        usage_frequency: 'weekly',
        trajectory: 'stable',
      },
      skill_details: {
        practiced_at: [
          { location_id: 'dummy-loc-2', location_name: 'Golden Gate Park', practice_count: 30, last_practiced: daysAgo(5), evidence_entry_ids: [] },
        ],
      },
    },
    created_at: daysAgo(365),
    updated_at: daysAgo(2),
  }),
  makeSkill({
    id: 'skill-demo-dj',
    user_id: 'mock-user',
    skill_name: 'DJ Mixing',
    skill_category: 'creative',
    current_level: 3,
    total_xp: 480,
    xp_to_next_level: 220,
    description: 'House and goth sets — late nights at Catch One and home practice.',
    first_mentioned_at: daysAgo(250),
    last_practiced_at: daysAgo(12),
    practice_count: 16,
    auto_detected: true,
    confidence_score: 0.82,
    is_active: true,
    metadata: {
      skill_profile: {
        skill_type: 'creative',
        monetization: 'potentially_paid',
        proficiency: 38,
        enjoyment: 95,
        usage_frequency: 'monthly',
        trajectory: 'improving',
      },
      skill_details: {
        practiced_at: [
          { location_id: 'dummy-loc-8', location_name: 'Catch One', practice_count: 10, last_practiced: daysAgo(12), evidence_entry_ids: [] },
        ],
      },
    },
    created_at: daysAgo(250),
    updated_at: daysAgo(12),
  }),
];

const additionalSkillSeeds: SkillSeed[] = [
  { id: 'skill-demo-typescript', skill_name: 'TypeScript', skill_category: 'technical', current_level: 8, description: 'Types, generics, and keeping the LoreBook codebase honest.', startedDaysAgo: 700, practicedDaysAgo: 1, practice_count: 145, monetization: 'paid', usage_frequency: 'daily', location: { id: 'dummy-loc-1', name: 'Novara HQ' } },
  { id: 'skill-demo-node', skill_name: 'Node.js APIs', skill_category: 'technical', current_level: 7, description: 'Express routes, Supabase, and shipping server features.', startedDaysAgo: 650, practicedDaysAgo: 2, practice_count: 98, monetization: 'paid', location: { id: 'dummy-loc-1', name: 'Novara HQ' } },
  { id: 'skill-demo-ui-design', skill_name: 'UI Design', skill_category: 'creative', current_level: 6, description: 'Layout, typography, and mobile-first polish for LoreBook.', startedDaysAgo: 400, practicedDaysAgo: 5, practice_count: 44, monetization: 'potentially_paid', location: { id: 'dummy-loc-3', name: 'Home Studio' } },
  { id: 'skill-demo-product', skill_name: 'Product Thinking', skill_category: 'professional', current_level: 6, description: 'Scoping features users actually need from journal noise.', startedDaysAgo: 500, practicedDaysAgo: 7, practice_count: 36, monetization: 'paid', location: { id: 'dummy-loc-1', name: 'Novara HQ' } },
  { id: 'skill-demo-piano', skill_name: 'Piano', skill_category: 'artistic', current_level: 2, description: 'Basic chords — mostly weekend noodling.', startedDaysAgo: 180, practicedDaysAgo: 21, practice_count: 14, trajectory: 'improving', location: { id: 'dummy-loc-3', name: 'Home Studio' }, why: 'Wanted to understand music theory beyond production.' },
  { id: 'skill-demo-yoga', skill_name: 'Yoga', skill_category: 'physical', current_level: 4, description: 'Vinyasa classes and recovery after BJJ.', startedDaysAgo: 220, practicedDaysAgo: 3, practice_count: 38, location: { id: 'dummy-loc-6', name: 'Mission Climbing Gym' } },
  { id: 'skill-demo-climbing', skill_name: 'Rock Climbing', skill_category: 'physical', current_level: 3, description: 'Top-rope sessions with Ethan on weekends.', startedDaysAgo: 150, practicedDaysAgo: 9, practice_count: 20, teacher: { id: 'dummy-9', name: 'Ethan Walker' }, location: { id: 'dummy-loc-6', name: 'Mission Climbing Gym' } },
  { id: 'skill-demo-swim', skill_name: 'Swimming', skill_category: 'physical', current_level: 2, description: 'Laps for low-impact cardio.', startedDaysAgo: 90, practicedDaysAgo: 18, practice_count: 11, trajectory: 'stable' },
  { id: 'skill-demo-weights', skill_name: 'Weight Training', skill_category: 'physical', current_level: 5, description: 'Compound lifts — consistency over PRs.', startedDaysAgo: 400, practicedDaysAgo: 4, practice_count: 62, location: { id: 'dummy-loc-6', name: 'Mission Climbing Gym' } },
  { id: 'skill-demo-negotiation', skill_name: 'Negotiation', skill_category: 'social', current_level: 4, description: 'Salary talks, vendor contracts, and boundary-setting.', startedDaysAgo: 360, practicedDaysAgo: 45, practice_count: 12, monetization: 'paid', proficiency: 50 },
  { id: 'skill-demo-networking', skill_name: 'Networking', skill_category: 'social', current_level: 3, description: 'Meetups, intros, and staying in touch without cringe.', startedDaysAgo: 300, practicedDaysAgo: 20, practice_count: 15, enjoyment: 40 },
  { id: 'skill-demo-data', skill_name: 'Data Analysis', skill_category: 'intellectual', current_level: 5, description: 'SQL, spreadsheets, and making sense of journal metrics.', startedDaysAgo: 450, practicedDaysAgo: 8, practice_count: 29, monetization: 'potentially_paid', location: { id: 'dummy-loc-1', name: 'Novara HQ' } },
  { id: 'skill-demo-chess', skill_name: 'Chess', skill_category: 'intellectual', current_level: 3, description: 'Online blitz and occasional park boards.', startedDaysAgo: 200, practicedDaysAgo: 2, practice_count: 48, location: { id: 'dummy-loc-2', name: 'Golden Gate Park' } },
  { id: 'skill-demo-finance', skill_name: 'Personal Finance', skill_category: 'practical', current_level: 5, description: 'Budgeting, investing basics, and tax prep.', startedDaysAgo: 800, practicedDaysAgo: 6, practice_count: 55, trajectory: 'stable', why: 'Needed control after a chaotic year.' },
  { id: 'skill-demo-baking', skill_name: 'Sourdough Baking', skill_category: 'practical', current_level: 4, description: 'Starter maintenance and weekend loaves.', startedDaysAgo: 280, practicedDaysAgo: 10, practice_count: 32, location: { id: 'dummy-loc-3', name: 'Home Studio' } },
  { id: 'skill-demo-espresso', skill_name: 'Espresso Craft', skill_category: 'practical', current_level: 3, description: 'Dialing in shots — morning ritual.', startedDaysAgo: 120, practicedDaysAgo: 0, practice_count: 90, usage_frequency: 'daily', location: { id: 'dummy-loc-3', name: 'Home Studio' } },
  { id: 'skill-demo-garden', skill_name: 'Urban Gardening', skill_category: 'practical', current_level: 2, description: 'Balcony herbs and tomato experiments.', startedDaysAgo: 100, practicedDaysAgo: 14, practice_count: 16, trajectory: 'improving' },
  { id: 'skill-demo-video', skill_name: 'Video Editing', skill_category: 'creative', current_level: 4, description: 'Cuts, color, and export for side projects.', startedDaysAgo: 350, practicedDaysAgo: 11, practice_count: 24, monetization: 'potentially_paid', location: { id: 'dummy-loc-3', name: 'Home Studio' } },
  { id: 'skill-demo-podcast', skill_name: 'Podcast Production', skill_category: 'creative', current_level: 3, description: 'Recording, editing, and show notes.', startedDaysAgo: 160, practicedDaysAgo: 25, practice_count: 10, monetization: 'potentially_paid' },
  { id: 'skill-demo-watercolor', skill_name: 'Watercolor', skill_category: 'artistic', current_level: 2, description: 'Loose sketches on Sunday mornings.', startedDaysAgo: 140, practicedDaysAgo: 16, practice_count: 9, enjoyment: 88, location: { id: 'dummy-loc-4', name: 'Ritual Coffee' } },
  { id: 'skill-demo-pottery', skill_name: 'Pottery', skill_category: 'artistic', current_level: 2, description: 'Beginner wheel classes — messy but meditative.', startedDaysAgo: 60, practicedDaysAgo: 28, practice_count: 6, teacher: { id: 'dummy-1', name: 'Sarah Chen' } },
  { id: 'skill-demo-french', skill_name: 'French', skill_category: 'intellectual', current_level: 2, description: 'Travel prep and podcast listening.', startedDaysAgo: 80, practicedDaysAgo: 3, practice_count: 22, usage_frequency: 'daily' },
  { id: 'skill-demo-japanese', skill_name: 'Japanese', skill_category: 'intellectual', current_level: 1, description: 'Hiragana and basic phrases — early days.', startedDaysAgo: 45, practicedDaysAgo: 1, practice_count: 18, proficiency: 15 },
  { id: 'skill-demo-sign', skill_name: 'Sign Language', skill_category: 'social', current_level: 2, description: 'ASL basics for inclusive communication.', startedDaysAgo: 200, practicedDaysAgo: 30, practice_count: 8, trajectory: 'improving' },
  { id: 'skill-demo-first-aid', skill_name: 'First Aid', skill_category: 'practical', current_level: 3, description: 'Certified — hope you never need it.', startedDaysAgo: 500, practicedDaysAgo: 120, practice_count: 4, usage_frequency: 'rarely', trajectory: 'stable' },
  { id: 'skill-demo-home-repair', skill_name: 'Home Repair', skill_category: 'practical', current_level: 4, description: 'Drywall patches, IKEA builds, and leaky faucets.', startedDaysAgo: 600, practicedDaysAgo: 22, practice_count: 19, why: 'Renting taught you to fix small things yourself.' },
  { id: 'skill-demo-improv', skill_name: 'Improv Comedy', skill_category: 'social', current_level: 3, description: 'Wednesday night class — yes-and energy.', startedDaysAgo: 130, practicedDaysAgo: 7, practice_count: 14, enjoyment: 78 },
  { id: 'skill-demo-salsa', skill_name: 'Salsa Dancing', skill_category: 'physical', current_level: 2, description: 'Social dance nights — learning to lead.', startedDaysAgo: 90, practicedDaysAgo: 13, practice_count: 12, location: { id: 'dummy-loc-8', name: 'Catch One' } },
  { id: 'skill-demo-ml', skill_name: 'Machine Learning', skill_category: 'technical', current_level: 4, description: 'Embeddings, classifiers, and LoreBook entity work.', startedDaysAgo: 300, practicedDaysAgo: 2, practice_count: 41, monetization: 'paid', location: { id: 'dummy-loc-1', name: 'Novara HQ' } },
  { id: 'skill-demo-cloud', skill_name: 'Cloud Architecture', skill_category: 'technical', current_level: 5, description: 'Deploy pipelines, env vars, and uptime.', startedDaysAgo: 420, practicedDaysAgo: 5, practice_count: 33, monetization: 'paid' },
  { id: 'skill-demo-storytelling', skill_name: 'Storytelling', skill_category: 'creative', current_level: 5, description: 'Turning journal chaos into narratives people feel.', startedDaysAgo: 380, practicedDaysAgo: 4, practice_count: 27, teacher: { id: 'dummy-1', name: 'Sarah Chen' }, location: { id: 'dummy-loc-4', name: 'Ritual Coffee' } },
  { id: 'skill-demo-emotional-reg', skill_name: 'Emotional Regulation', skill_category: 'emotional', current_level: 4, description: 'Naming feelings before reacting — work in progress.', startedDaysAgo: 240, practicedDaysAgo: 1, practice_count: 52, usage_frequency: 'daily', why: 'Therapy homework that actually stuck.' },
  { id: 'skill-demo-knitting', skill_name: 'Knitting', skill_category: 'artistic', current_level: 1, description: 'Started a scarf in 2023 — still on row twelve.', startedDaysAgo: 400, practicedDaysAgo: 200, practice_count: 3, is_active: false, trajectory: 'declining', auto_detected: false },
  { id: 'skill-demo-fencing', skill_name: 'Fencing', skill_category: 'physical', current_level: 1, description: 'One intro class — fun but not prioritized.', startedDaysAgo: 60, practicedDaysAgo: 55, practice_count: 2, is_active: false, auto_detected: false, proficiency: 12 },
  { id: 'skill-demo-calligraphy', skill_name: 'Calligraphy', skill_category: 'artistic', current_level: 2, description: 'Lettering for gifts and journal headers.', startedDaysAgo: 150, practicedDaysAgo: 19, practice_count: 11, enjoyment: 82 },
  { id: 'skill-demo-3d', skill_name: '3D Modeling', skill_category: 'technical', current_level: 3, description: 'Blender experiments for game side quests.', startedDaysAgo: 220, practicedDaysAgo: 15, practice_count: 17, monetization: 'hobby_only', location: { id: 'dummy-loc-3', name: 'Home Studio' } },
  { id: 'skill-demo-trail-run', skill_name: 'Trail Running', skill_category: 'physical', current_level: 4, description: 'Headlands loops and muddy descents.', startedDaysAgo: 280, practicedDaysAgo: 6, practice_count: 34, location: { id: 'dummy-loc-9', name: 'Marin Headlands Trail' } },
  { id: 'skill-demo-digital-marketing', skill_name: 'Digital Marketing', skill_category: 'professional', current_level: 3, description: 'Newsletters, landing pages, and launch posts.', startedDaysAgo: 180, practicedDaysAgo: 12, practice_count: 21, monetization: 'potentially_paid' },
  { id: 'skill-demo-conflict', skill_name: 'Conflict Resolution', skill_category: 'social', current_level: 4, description: 'De-escalation at work and in relationships.', startedDaysAgo: 320, practicedDaysAgo: 8, practice_count: 19, proficiency: 58 },
  { id: 'skill-demo-singing', skill_name: 'Singing', skill_category: 'artistic', current_level: 2, description: 'Shower concerts and occasional karaoke.', startedDaysAgo: 500, practicedDaysAgo: 24, practice_count: 13, enjoyment: 92 },
  { id: 'skill-demo-carpentry', skill_name: 'Carpentry', skill_category: 'practical', current_level: 3, description: 'Basic cuts and a bookshelf you actually use.', startedDaysAgo: 350, practicedDaysAgo: 40, practice_count: 8, teacher: { id: 'dummy-9', name: 'Ethan Walker' } },
];

export const skillBookDemoSkills: Skill[] = [
  ...curatedSkillBookDemoSkills,
  ...additionalSkillSeeds.map(skillFromSeed),
];

export default skillBookDemoSkills;
