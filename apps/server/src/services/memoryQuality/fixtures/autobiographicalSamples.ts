import type { ExpectedMemory } from '../memoryQualityScore';

export type MemoryQualitySample = {
  id: string;
  text: string;
  expected: ExpectedMemory;
  entities?: { people?: string[]; places?: string[]; orgs?: string[] };
  /** Optional expected event count range for future boundary checks */
  expectedEventCountRange?: [number, number];
  /** Hard-negative: deep meaning must be empty or nearly empty */
  hardNegative?: boolean;
};

/**
 * Expanded autobiographical benchmark (50+ fixtures).
 * mustNotInvent / mustNotExtract drive hallucination traps — never hardcode fixture IDs in extractors.
 */
export const AUTOBIOGRAPHICAL_SAMPLES: MemoryQualitySample[] = [
  // ── Core quality fixtures ──────────────────────────────────────────────
  {
    id: 'anime-expo-boundaries',
    text: `I went to the club last night after the comic con. There was a BassRiot afterparty at the Warehouse. I danced with Mothdoll and Vexadoll. One of their friends pulled away, so I backed off and respected her boundary. The situation with Jenna taught me to respect boundaries. Earlier that day I visited the comic con and stopped by my tía's house for food.`,
    entities: { people: ['Mothdoll', 'Vexadoll', 'Jenna'], places: ['the Warehouse', 'the comic con'] },
    expected: {
      people: ['Mothdoll', 'Vexadoll', 'Jenna'],
      places: ['the Warehouse', 'the comic con'],
      lessons: ['respect boundaries', 'boundaries'],
      pastEventHints: ['Jenna'],
      behaviorChanges: ['boundary', 'respect'],
      relationshipDimensions: [{ person: 'tía', dimension: 'family' }],
      mustNotInvent: ['married Jenna', 'owns the Warehouse', 'hates Mothdoll'],
    },
    expectedEventCountRange: [1, 4],
  },
  {
    id: 'e2e-jenna-catch',
    text: `The situation with Jenna taught me that I need to respect people's boundaries. At the the Warehouse afterparty, one woman pulled away while we were dancing, so I stopped and gave her space. I was disappointed that I didn't go home with anyone, but I'm glad I didn't pressure anybody.`,
    entities: { people: ['Jenna'], places: ['the Warehouse'] },
    expected: {
      people: ['Jenna'],
      places: ['the Warehouse'],
      lessons: ['boundaries', 'respect'],
      pastEventHints: ['Jenna'],
      behaviorChanges: ['space', 'stopped', 'boundary', 'respect'],
      mustNotInvent: [
        'she was afraid',
        'she disliked me',
        'permanently transformed',
        'fully socially skilled',
      ],
    },
  },
  {
    id: 'career-mentor',
    text: `My manager Khalil at Mach Industries asked me to lead the robotics prototype. Khalil is my mentor. I've been learning control systems and I'm getting better at ROS. I want to become a robotics engineer.`,
    entities: { people: ['Khalil'], orgs: ['Mach Industries'] },
    expected: {
      people: ['Khalil'],
      organizations: ['Mach Industries'],
      relationshipDimensions: [
        { person: 'Khalil', dimension: 'manager' },
        { person: 'Khalil', dimension: 'mentor' },
      ],
      progressions: ['learning', 'competent'],
      preferences: [{ subject: 'robotics engineer', lifecycle: 'goal' }],
      mustNotInvent: ['fired Khalil', 'CEO of Mach'],
    },
  },
  {
    id: 'stable-vs-temp-pref',
    text: `I like punk. I've been listening to punk all week. I want to play in a band someday. I am a musician at heart.`,
    expected: {
      preferences: [
        { subject: 'punk', lifecycle: 'stable' },
        { subject: 'punk', lifecycle: 'temporary' },
        { subject: 'play in a band', lifecycle: 'goal' },
        { subject: 'musician', lifecycle: 'identity' },
      ],
      mustNotInvent: ['hates punk', 'signed to a label'],
    },
  },
  {
    id: 'moving-and-habit',
    text: `I moved to Austin last month. Every morning I run around Lady Bird Lake. I'm more confident since the move. I usually journal before work.`,
    entities: { places: ['Austin', 'Lady Bird Lake'] },
    expected: {
      places: ['Austin'],
      progressions: ['moving', 'new_routine', 'confidence_increase', 'habit'],
      preferences: [{ subject: 'journal before work', lifecycle: 'habit' }],
      mustNotInvent: ['bought a house in NYC'],
    },
  },
  {
    id: 'friendship-recurring',
    text: `My friend Sam and I always grab coffee after BJJ. Sam is my coworker too. I keep running into Maya at the gym.`,
    entities: { people: ['Sam', 'Maya'] },
    expected: {
      people: ['Sam', 'Maya'],
      relationshipDimensions: [
        { person: 'Sam', dimension: 'friend' },
        { person: 'Sam', dimension: 'coworker' },
        { person: 'Maya', dimension: 'recurring' },
      ],
      mustNotInvent: ['dating Sam', 'married Maya'],
    },
  },
  {
    id: 'breakup-lesson',
    text: `After I broke up with Jordan I learned that I need better communication. From now on I'll speak up earlier. That taught me patience.`,
    entities: { people: ['Jordan'] },
    expected: {
      people: ['Jordan'],
      lessons: ['communication', 'patience'],
      progressions: ['relationship_transition'],
      behaviorChanges: ['communication', 'patience'],
      mustNotInvent: ['engaged to Jordan'],
    },
  },
  {
    id: 'skill-expert',
    text: `I used to be a beginner at piano. I've been practicing scales for years. I'm comfortable with jazz voicings now. I'm an expert at sight-reading.`,
    expected: {
      progressions: ['beginner', 'learning', 'competent', 'expert'],
      mustNotInvent: ['won a Grammy'],
    },
  },
  {
    id: 'family-work-mix',
    text: `I stopped by my tía Lourdes house after work. She's my mother's sister. At work my colleague Priya and I shipped the API. I felt proud.`,
    entities: { people: ['Lourdes', 'Priya'] },
    expected: {
      people: ['Lourdes', 'Priya'],
      relationshipDimensions: [
        { person: 'Lourdes', dimension: 'family' },
        { person: 'Priya', dimension: 'coworker' },
      ],
      mustNotInvent: ['fired Priya'],
    },
  },

  // ── Hard negatives (must not invent deep autobiographical meaning) ─────
  {
    id: 'hn-backup-db',
    hardNegative: true,
    text: 'I backed up the database.',
    expected: { mustNotInvent: ['boundary', 'identity growth', 'lesson', 'personal growth'] },
  },
  {
    id: 'hn-meeting-nine',
    hardNegative: true,
    text: 'I learned that the meeting starts at nine.',
    expected: { mustNotInvent: ['identity growth', 'behavior change', 'respect boundaries'] },
  },
  {
    id: 'hn-cable',
    hardNegative: true,
    text: 'I pulled back the cable.',
    expected: { mustNotInvent: ['boundary', 'respect', 'behavior change'] },
  },
  {
    id: 'hn-manager-schedule',
    hardNegative: true,
    text: 'My manager changed the schedule.',
    expected: { mustNotInvent: ['mentor', 'trust conflict', 'best friend'] },
  },
  {
    id: 'hn-wish',
    hardNegative: true,
    text: 'I wish I had stood up for myself.',
    expected: { mustNotInvent: ['I stood up', 'completed behavior change'] },
  },
  {
    id: 'hn-friend-said',
    hardNegative: true,
    text: "My friend said I'm becoming more confident.",
    expected: { mustNotInvent: ['I am fully confident', 'identity confirmed'] },
  },
  {
    id: 'hn-conditional-job',
    hardNegative: true,
    text: "If I get the job, I'll move.",
    expected: { mustNotInvent: ['I moved', 'I got the job', 'career transition completed'] },
  },
  {
    id: 'hn-one-piece',
    hardNegative: true,
    text: 'In One Piece, Luffy learned to trust his crew.',
    expected: { mustNotInvent: ['I learned', 'identity growth', 'my lesson'] },
  },
  {
    id: 'hn-ai-said',
    hardNegative: true,
    text: "The AI said I'm resilient.",
    expected: { mustNotInvent: ['I am resilient', 'identity growth'] },
  },
  {
    id: 'hn-hypothetical',
    hardNegative: true,
    text: 'Hypothetically I would quit tomorrow.',
    expected: { mustNotInvent: ['I quit'] },
  },
  {
    id: 'hn-dream',
    hardNegative: true,
    text: 'I dreamed that I became a doctor.',
    expected: { mustNotInvent: ['I am a doctor'] },
  },
  {
    id: 'hn-fiction-book',
    hardNegative: true,
    text: 'In the book the hero learned humility.',
    expected: { mustNotInvent: ['I learned humility', 'identity'] },
  },
  {
    id: 'hn-negation',
    hardNegative: true,
    text: "I'm not dating anyone.",
    expected: { mustNotInvent: [] },
  },
  {
    id: 'hn-chatgpt-said',
    hardNegative: true,
    text: 'ChatGPT said I should change careers.',
    expected: { mustNotInvent: ['career transition', 'I changed careers'] },
  },

  // ── Domain / style coverage ────────────────────────────────────────────
  { id: 'work-promotion', text: 'I got promoted to senior engineer. My boss Lena said I earned it. I felt proud but also nervous.', expected: { people: ['Lena'], mustNotInvent: ['fired Lena'] }, entities: { people: ['Lena'] } },
  { id: 'work-layoff', text: "I got laid off last Friday. I'm less confident about the market now.", expected: { progressions: ['confidence_decrease'], mustNotInvent: [] } },
  { id: 'family-dinner', text: "Sunday dinner at my mom's place with my brother Diego. Mom is worried about Dad's health.", expected: { people: ['Diego'], relationshipDimensions: [{ person: 'Diego', dimension: 'family' }], mustNotInvent: [] }, entities: { people: ['Diego'] } },
  { id: 'dating-first', text: "I went on a first date with Avery. We talked for hours. I'm interested but taking it slow.", expected: { people: ['Avery'], relationshipDimensions: [{ person: 'Avery', dimension: 'romantic' }], mustNotInvent: ['married Avery'] }, entities: { people: ['Avery'] } },
  { id: 'breakup-hard', text: 'Alex and I broke up. I\'m sad. I learned that I ignore red flags too long.', expected: { people: ['Alex'], lessons: ['red flags'], progressions: ['relationship_transition'], mustNotInvent: [] }, entities: { people: ['Alex'] } },
  { id: 'school-exam', text: "I failed the midterm. I'm studying harder. I want to pass the retake.", expected: { preferences: [{ subject: 'pass the retake', lifecycle: 'goal' }], mustNotInvent: [] } },
  { id: 'career-switch', text: "I'm switching careers from finance to software. I'm a beginner at coding.", expected: { progressions: ['career_transition', 'beginner'], mustNotInvent: [] } },
  { id: 'project-ship', text: 'We shipped the MVP of my side project last night. Working on it with my coworker Ren.', expected: { people: ['Ren'], relationshipDimensions: [{ person: 'Ren', dimension: 'coworker' }], mustNotInvent: [] }, entities: { people: ['Ren'] } },
  { id: 'tech-learn', text: "I've been learning TypeScript. I'm getting better at generics.", expected: { progressions: ['learning', 'competent'], mustNotInvent: [] } },
  { id: 'fitness', text: 'I hit a new PR on deadlift. Every morning I train at the gym.', expected: { progressions: ['new_routine'], mustNotInvent: [] } },
  { id: 'bjj', text: 'I got my blue belt in BJJ. Coach Marco is my mentor.', expected: { people: ['Marco'], relationshipDimensions: [{ person: 'Marco', dimension: 'mentor' }], mustNotInvent: [] }, entities: { people: ['Marco'] } },
  { id: 'health-routine', text: 'I usually take my meds at 9pm. I\'ve been more consistent this month.', expected: { preferences: [{ subject: 'meds', lifecycle: 'habit' }], mustNotInvent: [] } },
  { id: 'travel', text: 'I flew to Tokyo last week. Visited Shibuya with my friend Noa.', expected: { people: ['Noa'], places: ['Tokyo'], relationshipDimensions: [{ person: 'Noa', dimension: 'friend' }], mustNotInvent: [] }, entities: { people: ['Noa'], places: ['Tokyo'] } },
  { id: 'nightlife', text: 'We went out dancing at Output. I left early because I was tired.', expected: { mustNotInvent: ['boundary respect identity'] } },
  { id: 'creative', text: "I finished a painting for my show. I'm becoming more confident as an artist.", expected: { progressions: ['confidence_increase'], mustNotInvent: [] } },
  { id: 'money-goal', text: 'I want to save $10k this year. I usually skip takeout on weekdays.', expected: { preferences: [{ subject: 'save', lifecycle: 'goal' }], mustNotInvent: [] } },
  { id: 'mistake', text: 'I snapped at my roommate Kai. I apologized. That taught me to cool off first.', expected: { people: ['Kai'], lessons: ['cool off'], relationshipDimensions: [{ person: 'Kai', dimension: 'roommate' }], mustNotInvent: [] }, entities: { people: ['Kai'] } },
  { id: 'conflict', text: 'I argued with my manager about deadlines. I stayed professional.', expected: { mustNotInvent: ['best friends with manager'] } },
  { id: 'achievement', text: 'I ran my first marathon. I felt proud.', expected: { mustNotInvent: [] } },
  { id: 'loss', text: 'My abuelo passed last year. I still miss him.', expected: { mustNotInvent: [] } },
  { id: 'uncertainty', text: "I don't know if I should take the offer. I'm anxious.", expected: { mustNotInvent: ['I took the offer'] } },
  { id: 'future-plan', text: "Next year I plan to move to Seattle. From now on I'll network more.", expected: { progressions: ['moving'], mustNotInvent: ['I moved to Seattle already'] } },
  { id: 'short-casual', text: 'hung w/ mala at catch one. jenna stuff still in my head. backed off when she pulled away.', expected: { mustNotInvent: ['married'] } },
  { id: 'runon', text: "so yeah i was at the afterparty and this girl pulled away and i just stopped cause of what jenna taught me about boundaries and i was kinda sad i went home alone but glad i didnt push it", expected: { lessons: ['boundaries'], pastEventHints: ['jenna'], mustNotInvent: [] } },
  { id: 'speech-stt', text: 'um I went to my tees house after anime expo and then the club and I learned I need to respect people space', expected: { lessons: ['respect', 'space'], mustNotInvent: [] } },
  { id: 'misspell', text: 'My freind Sam is my cowroker. We always grab coffe after BJJ.', expected: { people: ['Sam'], mustNotInvent: [] }, entities: { people: ['Sam'] } },
  { id: 'pronoun-heavy', text: "She pulled away so I stopped. I'm glad I didn't pressure anybody. I was disappointed.", expected: { mustNotInvent: ['she hated me'] } },
  { id: 'emotion-charge', text: "I'm furious that I got passed over. I want to become someone they can't ignore.", expected: { preferences: [{ subject: 'become', lifecycle: 'goal' }], mustNotInvent: [] } },
  { id: 'neutral-fact', text: 'I arrived at the Warehouse at 11pm. Mothdoll was there. We danced.', expected: { people: ['Mothdoll'], places: ['the Warehouse'], mustNotInvent: ['identity growth'] }, entities: { people: ['Mothdoll'], places: ['the Warehouse'] } },
  { id: 'mentor-former', text: 'Priya used to work with me at Strativ. She\'s a former coworker.', expected: { people: ['Priya'], relationshipDimensions: [{ person: 'Priya', dimension: 'former_coworker' }], mustNotInvent: [] }, entities: { people: ['Priya'] } },
  { id: 'roommate', text: "My roommate Theo left dishes out again. I'm learning patience.", expected: { people: ['Theo'], progressions: ['learning'], relationshipDimensions: [{ person: 'Theo', dimension: 'roommate' }], mustNotInvent: [] }, entities: { people: ['Theo'] } },
  { id: 'neighbor', text: 'My neighbor Asha brought cookies. She\'s kind.', expected: { people: ['Asha'], relationshipDimensions: [{ person: 'Asha', dimension: 'neighbor' }], mustNotInvent: [] }, entities: { people: ['Asha'] } },
  { id: 'client-work', text: 'My client Jordan signed the contract. I felt relieved.', expected: { people: ['Jordan'], relationshipDimensions: [{ person: 'Jordan', dimension: 'client' }], mustNotInvent: [] }, entities: { people: ['Jordan'] } },
  { id: 'recruiter', text: 'Sam from Strativ Group recruits for Mach Industries.', expected: { people: ['Sam'], relationshipDimensions: [{ person: 'Sam', dimension: 'recruiter' }], mustNotInvent: [] }, entities: { people: ['Sam'] } },
  { id: 'habit-run', text: 'Every morning I run. I usually stretch after.', expected: { progressions: ['new_routine'], mustNotInvent: [] } },
  { id: 'confidence-down', text: 'I lost confidence after the demo failed.', expected: { progressions: ['confidence_decrease'], mustNotInvent: [] } },
  { id: 'identity-direct', text: 'I am a robotics engineer.', expected: { preferences: [{ subject: 'robotics engineer', lifecycle: 'identity' }], mustNotInvent: [] } },
  { id: 'goal-direct', text: 'I want to become a robotics engineer.', expected: { preferences: [{ subject: 'robotics engineer', lifecycle: 'goal' }], mustNotInvent: [] } },
  { id: 'temp-music', text: "I've been listening to techno all week.", expected: { preferences: [{ subject: 'techno', lifecycle: 'temporary' }], mustNotInvent: [] } },
  { id: 'stable-music', text: 'I like techno.', expected: { preferences: [{ subject: 'techno', lifecycle: 'stable' }], mustNotInvent: [] } },
  { id: 'family-tia', text: "I stopped by my tía's house for food after work.", expected: { relationshipDimensions: [{ person: 'tía', dimension: 'family' }], mustNotInvent: [] } },
  { id: 'handled-better', text: 'I think I handled the situation better this time.', expected: { mustNotInvent: ['fully transformed'] } },
  { id: 'paraphrase-jenna-1', text: 'What happened with Jenna taught me to give people space when they pull away.', expected: { lessons: ['space', 'pull'], pastEventHints: ['Jenna'], mustNotInvent: [] } },
  { id: 'paraphrase-jenna-2', text: 'Because of Jenna I respect boundaries more. At the club I stopped when she moved back.', expected: { lessons: ['boundaries'], pastEventHints: ['Jenna'], mustNotInvent: [] } },
  { id: 'counter-no-lesson', text: 'Jenna texted me about the party. Nothing deep.', expected: { mustNotInvent: ['taught me', 'identity growth'] } },
];

export const HARD_NEGATIVE_IDS = new Set(
  AUTOBIOGRAPHICAL_SAMPLES.filter((s) => s.hardNegative).map((s) => s.id),
);
