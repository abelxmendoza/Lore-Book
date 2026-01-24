/**
 * Event Mock Data
 * 
 * Events from "The Creative Renaissance" narrative with full entity connections
 * (characters, locations, skills, memories).
 */

import { ENTITY_IDS } from './unifiedNarrativeData';
import type { NarrativeEvent } from './unifiedNarrativeData';

const now = new Date();
const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
const oneAndHalfYearsAgo = new Date(now.getTime() - 547 * 24 * 60 * 60 * 1000);
const tenMonthsAgo = new Date(now.getTime() - 300 * 24 * 60 * 60 * 1000);
const fiveAndHalfMonthsAgo = new Date(now.getTime() - 165 * 24 * 60 * 60 * 1000);
const fourMonthsAgo = new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000);
const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

export const narrativeEvents: NarrativeEvent[] = [
  {
    id: ENTITY_IDS.EP_CONCEPT_SESSION,
    title: 'EP Concept Session',
    start_time: new Date(tenMonthsAgo.getTime() + 50 * 24 * 60 * 60 * 1000).toISOString(),
    end_time: new Date(tenMonthsAgo.getTime() + 50 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000).toISOString(),
    type: 'creative_breakthrough',
      characters: ['dummy-3'], // Alex Rivera
    locations: [ENTITY_IDS.HOME_STUDIO],
    skills: [ENTITY_IDS.MUSIC_PRODUCTION],
    memories: ['mem-ep-concept-1', 'mem-ep-concept-2', 'mem-ep-concept-3', 'mem-ep-concept-4'],
    timeline_id: 'arc-first-album',
    summary: 'That late night when the EP concept fully crystallized. Sitting in my home studio at 2am, working with Alex Rivera, everything clicked into place.',
  },
  {
    id: ENTITY_IDS.FIRST_DATE_ALEX,
    title: 'First Date with Alex',
    start_time: sixMonthsAgo.toISOString(),
    end_time: new Date(sixMonthsAgo.getTime() + 4 * 60 * 60 * 1000).toISOString(),
    type: 'relationship_milestone',
    characters: [ENTITY_IDS.ALEX_BOYFRIEND],
    locations: [ENTITY_IDS.COFFEE_SHOP],
    skills: [],
    memories: ['mem-first-date-1', 'mem-first-date-2', 'mem-first-date-3', 'mem-first-date-4'],
    summary: 'First date - we talked for 4 hours without noticing time pass. I knew this was something special.',
  },
  {
    id: ENTITY_IDS.FIRST_KISS_ALEX,
    title: 'First Kiss with Alex',
    start_time: fiveAndHalfMonthsAgo.toISOString(),
    end_time: fiveAndHalfMonthsAgo.toISOString(),
    type: 'relationship_milestone',
    characters: [ENTITY_IDS.ALEX_BOYFRIEND],
    locations: [ENTITY_IDS.CENTRAL_PARK],
    skills: [],
    memories: ['mem-first-kiss-1', 'mem-first-kiss-2'],
    summary: 'First kiss under the stars in Central Park after our second date.',
  },
  {
    id: ENTITY_IDS.I_LOVE_YOU_ALEX,
    title: '"I Love You" with Alex',
    start_time: fourMonthsAgo.toISOString(),
    end_time: fourMonthsAgo.toISOString(),
    type: 'relationship_milestone',
    characters: [ENTITY_IDS.ALEX_BOYFRIEND],
    locations: [ENTITY_IDS.YOUR_APARTMENT],
    skills: [],
    memories: ['mem-i-love-you-1', 'mem-i-love-you-2'],
    summary: 'He said "I love you" first. I felt the same way.',
  },
  {
    id: ENTITY_IDS.THREE_MONTH_ANNIVERSARY,
    title: '3-Month Anniversary',
    start_time: threeMonthsAgo.toISOString(),
    end_time: new Date(threeMonthsAgo.getTime() + 3 * 60 * 60 * 1000).toISOString(),
    type: 'relationship_milestone',
    characters: [ENTITY_IDS.ALEX_BOYFRIEND],
    locations: [ENTITY_IDS.FANCY_RESTAURANT],
    skills: [],
    memories: ['mem-anniversary-1', 'mem-anniversary-2'],
    summary: '3 month anniversary dinner at a fancy restaurant.',
  },
  {
    id: ENTITY_IDS.FIRST_COLLABORATION_SESSION,
    title: 'First Collaboration Session with Alex Rivera',
    start_time: oneAndHalfYearsAgo.toISOString(),
    end_time: new Date(oneAndHalfYearsAgo.getTime() + 4 * 60 * 60 * 1000).toISOString(),
    type: 'creative_collaboration',
      characters: ['dummy-3'], // Alex Rivera
    locations: [ENTITY_IDS.HOME_STUDIO],
    skills: [ENTITY_IDS.MUSIC_PRODUCTION],
    memories: ['mem-first-collab-1', 'mem-first-collab-2'],
    summary: 'First time working together in my home studio. Marcus introduced us and we clicked immediately.',
  },
  {
    id: ENTITY_IDS.FIRST_TRACK_COMPLETED,
    title: 'First Track Completed',
    start_time: oneYearAgo.toISOString(),
    end_time: oneYearAgo.toISOString(),
    type: 'creative_milestone',
      characters: ['dummy-3'], // Alex Rivera
    locations: [ENTITY_IDS.HOME_STUDIO],
    skills: [ENTITY_IDS.MUSIC_PRODUCTION, ENTITY_IDS.AUDIO_ENGINEERING],
    memories: ['mem-first-track-1', 'mem-first-track-2'],
    summary: 'Completed my first full track with Alex Rivera\'s help. A major milestone in my music production journey.',
  },
  {
    id: ENTITY_IDS.FINAL_MIX_SESSION,
    title: 'Final Mix Session for EP',
    start_time: twoWeeksAgo.toISOString(),
    end_time: new Date(twoWeeksAgo.getTime() + 6 * 60 * 60 * 1000).toISOString(),
    type: 'creative_collaboration',
      characters: ['dummy-3'], // Alex Rivera
    locations: [ENTITY_IDS.HOME_STUDIO],
    skills: [ENTITY_IDS.MUSIC_PRODUCTION, ENTITY_IDS.AUDIO_ENGINEERING],
    memories: ['mem-final-mix-1', 'mem-final-mix-2'],
    summary: 'Final mixing session for the EP. Almost done!',
  },
  {
    id: ENTITY_IDS.EP_LISTENING_SESSION,
    title: 'EP Listening Session with Alex',
    start_time: twoWeeksAgo.toISOString(),
    end_time: new Date(twoWeeksAgo.getTime() + 2 * 60 * 60 * 1000).toISOString(),
    type: 'relationship_milestone',
    characters: [ENTITY_IDS.ALEX_BOYFRIEND],
    locations: [ENTITY_IDS.HOME_STUDIO],
    skills: [],
    memories: ['mem-listening-1', 'mem-listening-2'],
    summary: 'Played the EP for Alex for the first time. He loved it and was so supportive.',
  },
  {
    id: ENTITY_IDS.FIRST_WRITING_SESSION,
    title: 'First Writing Session with Sarah',
    start_time: twoYearsAgo.toISOString(),
    end_time: new Date(twoYearsAgo.getTime() + 3 * 60 * 60 * 1000).toISOString(),
    type: 'creative_collaboration',
      characters: ['dummy-1'], // Sarah Chen
    locations: [ENTITY_IDS.COFFEE_SHOP],
    skills: [ENTITY_IDS.CREATIVE_WRITING],
    memories: ['mem-first-writing-1', 'mem-first-writing-2'],
    summary: 'First time meeting Sarah at the coffee shop to write together. Started our regular writing sessions.',
  },
  {
    id: ENTITY_IDS.CAREER_TRANSITION_SUPPORT,
    title: 'Career Transition Support Meeting',
    start_time: new Date(twoYearsAgo.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    end_time: new Date(twoYearsAgo.getTime() + 30 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000).toISOString(),
    type: 'mentorship',
      characters: ['dummy-1'], // Sarah Chen
    locations: [ENTITY_IDS.COFFEE_SHOP],
    skills: [],
    memories: ['mem-career-transition-1', 'mem-career-transition-2'],
    summary: 'Sarah supported me through my decision to transition from tech to creative work. She was one of the first people I told.',
  },
  {
    id: ENTITY_IDS.MET_ALEX_THROUGH_SARAH,
    title: 'Met Alex Through Sarah',
    start_time: oneYearAgo.toISOString(),
    end_time: oneYearAgo.toISOString(),
    type: 'relationship_milestone',
      characters: [ENTITY_IDS.ALEX_BOYFRIEND, 'dummy-1'], // Alex (boyfriend), Sarah Chen
    locations: [ENTITY_IDS.COFFEE_SHOP],
    skills: [],
    memories: ['mem-met-alex-1', 'mem-met-alex-2'],
    summary: 'Sarah introduced me to Alex at the coffee shop. That\'s how we first met.',
  },
];

export default narrativeEvents;
