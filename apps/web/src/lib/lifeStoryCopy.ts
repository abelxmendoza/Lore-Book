/**
 * One vocabulary for life browse surfaces.
 * Moment = something that happened. Timeline = when. Anchors = chapters. Saga = the story.
 */

export const LIFE_STORY_CHAT_HINT = 'Chat first — that is how moments get saved.';

export const LIFE_STORY_SIDEBAR_BLURB =
  'Moments are things that happened. Timeline is when. Anchors are chapters that keep coming back. Life Saga is the story.';

export const LIFE_STORY_JOB = {
  moments:
    'These are your moments — things that happened. Timeline puts the same moments in time.',
  timeline:
    'This is when things happened. Anchors are the chapters that keep mattering. Life Saga is the story you read.',
  anchors:
    'These are chapters your life keeps returning to — people, work, family, places. Timeline is the date list. Life Saga is the book.',
  saga:
    'This is your life as a story: eras, threads, and turning points. Not a date list. For dates, open Timeline.',
} as const;

export const LIFE_STORY_HINT = {
  moments: 'Things that happened',
  timeline: 'When they happened',
  anchors: 'Chapters that keep coming back',
  saga: 'Read it as a story',
} as const;

export const LIFE_STORY_SAGA_GLOSSARY =
  'A chapter is a stretch of time. An arc is a thread through those chapters — a person, a job, a project.';

export const LIFE_STORY_CHRONOLOGY =
  'This is the date list. Life Saga is where you read the same life as a story.';

export const LIFE_STORY_EMPTY_SAGA =
  'LoreBook has not assembled a readable saga yet. Talk in Chat so moments can be saved. Then open Timeline to see them by date. This page appears when there are enough dated moments to group into chapters.';
