/**
 * Mock Quest Data
 * For development and demonstration
 */

import type { Quest, QuestBoard, QuestAnalytics, QuestHistory, QuestSuggestion } from '../types/quest';

const now = new Date();
const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
const lastMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

type CompletedTemplate = {
  title: string;
  description: string;
  quest_type: Quest['quest_type'];
  category: string;
  tags: string[];
  priority: number;
  importance: number;
  impact: number;
  completedDaysAgo: number;
  durationDays: number;
  source?: Quest['source'];
  completionNotes?: string;
};

const COMPLETED_QUEST_TEMPLATES: CompletedTemplate[] = [
  { title: 'Land First Freelance Client', description: 'Closed a small branding + web package for a local café after sharing portfolio drafts.', quest_type: 'main', category: 'career', tags: ['freelance', 'career'], priority: 9, importance: 9, impact: 9, completedDaysAgo: 12, durationDays: 45, completionNotes: 'Signed contract and delivered v1 on time.' },
  { title: 'Finish Album Mix for Demo Reel', description: 'Mixed and mastered three tracks with Alex Rivera for the creative reel.', quest_type: 'main', category: 'creative', tags: ['music', 'production'], priority: 8, importance: 8, impact: 8, completedDaysAgo: 18, durationDays: 21 },
  { title: 'Publish Personal Essay on Transition', description: 'Wrote and published an essay about leaving tech for creative work.', quest_type: 'side', category: 'creative', tags: ['writing', 'publishing'], priority: 7, importance: 8, impact: 7, completedDaysAgo: 25, durationDays: 14 },
  { title: '30-Day Meditation Streak', description: 'Completed daily 10-minute meditation for 30 consecutive days.', quest_type: 'daily', category: 'health', tags: ['mindfulness', 'daily'], priority: 7, importance: 8, impact: 7, completedDaysAgo: 8, durationDays: 30 },
  { title: 'Run First 5K', description: 'Trained for and completed a local 5K charity run.', quest_type: 'achievement', category: 'health', tags: ['fitness', 'running'], priority: 6, importance: 7, impact: 6, completedDaysAgo: 40, durationDays: 56 },
  { title: 'Set Up Home Studio Acoustics', description: 'Treated walls, positioned monitors, and calibrated room for mixing.', quest_type: 'side', category: 'creative', tags: ['studio', 'music'], priority: 7, importance: 6, impact: 7, completedDaysAgo: 55, durationDays: 10 },
  { title: 'Complete React Advanced Course', description: 'Finished hooks, patterns, and performance modules with capstone project.', quest_type: 'side', category: 'education', tags: ['react', 'learning'], priority: 7, importance: 7, impact: 7, completedDaysAgo: 70, durationDays: 28, source: 'extracted' },
  { title: 'Organize Digital Photo Archive', description: 'Sorted three years of photos into albums with backups.', quest_type: 'side', category: 'personal', tags: ['photos', 'organization'], priority: 5, importance: 5, impact: 4, completedDaysAgo: 33, durationDays: 5 },
  { title: 'Plan Summer Road Trip', description: 'Researched routes, booked stays, and built shared itinerary with Alex.', quest_type: 'side', category: 'personal', tags: ['travel', 'planning'], priority: 6, importance: 6, impact: 5, completedDaysAgo: 90, durationDays: 7 },
  { title: 'Launch Newsletter: Signal & Story', description: 'Published first three issues on creative process and life transitions.', quest_type: 'main', category: 'career', tags: ['writing', 'newsletter'], priority: 8, importance: 8, impact: 8, completedDaysAgo: 48, durationDays: 35 },
  { title: 'Complete Tax Prep for Last Year', description: 'Gathered receipts, filed return, and set aside quarterly estimates.', quest_type: 'side', category: 'finance', tags: ['taxes', 'admin'], priority: 8, importance: 7, impact: 6, completedDaysAgo: 110, durationDays: 4 },
  { title: 'Host Friendsgiving Dinner', description: 'Cooked for eight people and documented recipes for future quests.', quest_type: 'side', category: 'personal', tags: ['friends', 'cooking'], priority: 5, importance: 6, impact: 5, completedDaysAgo: 95, durationDays: 3 },
  { title: 'Ship Portfolio v1', description: 'Deployed first version of portfolio with writing, music, and contact form.', quest_type: 'main', category: 'career', tags: ['portfolio', 'web'], priority: 9, importance: 9, impact: 8, completedDaysAgo: 130, durationDays: 42 },
  { title: 'Read 12 Books This Year', description: 'Hit annual reading goal spanning fiction, memoir, and craft books.', quest_type: 'achievement', category: 'personal', tags: ['reading', 'goals'], priority: 6, importance: 7, impact: 6, completedDaysAgo: 15, durationDays: 340 },
  { title: 'Fix Sleep for 21 Nights', description: 'Maintained 11 PM–7 AM schedule with wind-down routine.', quest_type: 'daily', category: 'health', tags: ['sleep', 'routine'], priority: 8, importance: 9, impact: 8, completedDaysAgo: 60, durationDays: 21 },
  { title: 'Learn Basic Video Editing', description: 'Edited three behind-the-scenes studio clips for social.', quest_type: 'side', category: 'creative', tags: ['video', 'learning'], priority: 6, importance: 6, impact: 6, completedDaysAgo: 75, durationDays: 18 },
  { title: 'Reconnect with Marcus', description: 'Scheduled monthly creative check-ins after a long busy stretch.', quest_type: 'side', category: 'relationships', tags: ['friends', 'community'], priority: 7, importance: 8, impact: 7, completedDaysAgo: 22, durationDays: 14 },
  { title: 'Clear Credit Card Debt', description: 'Paid off remaining balance using freelance income plan.', quest_type: 'main', category: 'finance', tags: ['debt', 'finance'], priority: 9, importance: 9, impact: 9, completedDaysAgo: 145, durationDays: 90 },
  { title: 'Submit Track to Local Compilation', description: 'Sent demo track and metadata before deadline.', quest_type: 'side', category: 'creative', tags: ['music', 'submission'], priority: 7, importance: 7, impact: 7, completedDaysAgo: 38, durationDays: 6 },
  { title: 'Attend Songwriting Workshop', description: 'Completed weekend intensive and drafted two new song sketches.', quest_type: 'side', category: 'creative', tags: ['music', 'workshop'], priority: 6, importance: 7, impact: 6, completedDaysAgo: 52, durationDays: 2 },
  { title: 'Build Habit Tracker Spreadsheet', description: 'Created simple tracker for exercise, journaling, and practice hours.', quest_type: 'daily', category: 'productivity', tags: ['habits', 'tracking'], priority: 5, importance: 6, impact: 5, completedDaysAgo: 100, durationDays: 1 },
  { title: 'Complete First Paid Photo Shoot', description: 'Shot portraits for a friend\'s small business launch.', quest_type: 'side', category: 'creative', tags: ['photography', 'paid'], priority: 7, importance: 7, impact: 7, completedDaysAgo: 65, durationDays: 12 },
  { title: 'Migrate Email to New Domain', description: 'Moved accounts, updated DNS, and tested deliverability.', quest_type: 'side', category: 'admin', tags: ['email', 'tech'], priority: 6, importance: 5, impact: 5, completedDaysAgo: 120, durationDays: 3 },
  { title: 'Finish Coursera Music Theory', description: 'Completed fundamentals course with final composition assignment.', quest_type: 'main', category: 'education', tags: ['music', 'theory'], priority: 8, importance: 8, impact: 8, completedDaysAgo: 200, durationDays: 45 },
  { title: 'Volunteer at Community Garden', description: 'Helped with spring planting day and met neighbors.', quest_type: 'side', category: 'community', tags: ['volunteer', 'outdoors'], priority: 4, importance: 5, impact: 4, completedDaysAgo: 85, durationDays: 1 },
  { title: 'Record Voiceover for Friend\'s Podcast', description: 'Recorded intro narration and delivered edited files.', quest_type: 'side', category: 'creative', tags: ['audio', 'voice'], priority: 5, importance: 5, impact: 5, completedDaysAgo: 28, durationDays: 4 },
  { title: 'Complete Apartment Deep Clean', description: 'Decluttered closets, donated items, and reorganized workspace.', quest_type: 'side', category: 'personal', tags: ['home', 'organization'], priority: 6, importance: 5, impact: 4, completedDaysAgo: 14, durationDays: 2 },
  { title: 'Pass AWS Cloud Practitioner', description: 'Studied and passed certification exam.', quest_type: 'achievement', category: 'education', tags: ['aws', 'certification'], priority: 7, importance: 7, impact: 7, completedDaysAgo: 180, durationDays: 30 },
  { title: 'Write 30 Journal Entries', description: 'Hit monthly journaling goal with morning pages.', quest_type: 'daily', category: 'personal', tags: ['journaling', 'reflection'], priority: 6, importance: 7, impact: 6, completedDaysAgo: 5, durationDays: 30 },
  { title: 'Launch GitHub Open Source Template', description: 'Published starter template used by two side projects.', quest_type: 'side', category: 'career', tags: ['open-source', 'github'], priority: 6, importance: 6, impact: 6, completedDaysAgo: 160, durationDays: 8 },
  { title: 'Plan Q1 Creative Goals', description: 'Mapped EP release, portfolio, and income targets for the quarter.', quest_type: 'main', category: 'planning', tags: ['goals', 'quarterly'], priority: 8, importance: 8, impact: 7, completedDaysAgo: 105, durationDays: 3 },
  { title: 'Complete Therapy Intake Series', description: 'Finished initial six sessions and set ongoing cadence.', quest_type: 'main', category: 'health', tags: ['therapy', 'wellbeing'], priority: 9, importance: 9, impact: 9, completedDaysAgo: 150, durationDays: 42 },
  { title: 'Fix Bike and Commute Twice Weekly', description: 'Repaired brakes and established bike commute habit.', quest_type: 'daily', category: 'health', tags: ['bike', 'commute'], priority: 5, importance: 6, impact: 5, completedDaysAgo: 42, durationDays: 21 },
  { title: 'Edit Wedding Video for Cousin', description: 'Delivered highlight reel and full ceremony cut.', quest_type: 'side', category: 'creative', tags: ['video', 'family'], priority: 6, importance: 6, impact: 6, completedDaysAgo: 210, durationDays: 20 },
  { title: 'Set Up Automated Backups', description: 'Configured cloud backups for projects, photos, and DAW files.', quest_type: 'side', category: 'admin', tags: ['backup', 'tech'], priority: 7, importance: 7, impact: 6, completedDaysAgo: 88, durationDays: 2 },
  { title: 'Finish Short Story Draft', description: 'Completed 4,200-word draft for writers\' group.', quest_type: 'side', category: 'creative', tags: ['writing', 'fiction'], priority: 6, importance: 7, impact: 6, completedDaysAgo: 35, durationDays: 18 },
  { title: 'Host Studio Listening Party', description: 'Shared EP works-in-progress with close friends for feedback.', quest_type: 'side', category: 'community', tags: ['music', 'feedback'], priority: 5, importance: 6, impact: 6, completedDaysAgo: 20, durationDays: 5 },
  { title: 'Complete LinkedIn Profile Overhaul', description: 'Rewrote headline, added portfolio links, and refreshed recommendations.', quest_type: 'side', category: 'career', tags: ['linkedin', 'branding'], priority: 6, importance: 7, impact: 6, completedDaysAgo: 72, durationDays: 4 },
  { title: 'Learn Fingerstyle Guitar Basics', description: 'Practiced daily and learned three complete pieces.', quest_type: 'side', category: 'creative', tags: ['guitar', 'practice'], priority: 5, importance: 6, impact: 5, completedDaysAgo: 125, durationDays: 40 },
  { title: 'Run No-Spend Month', description: 'Tracked expenses and avoided non-essential purchases for 30 days.', quest_type: 'achievement', category: 'finance', tags: ['budget', 'savings'], priority: 7, importance: 8, impact: 7, completedDaysAgo: 240, durationDays: 30 },
  { title: 'Migrate Notes to LoreKeeper', description: 'Imported old journals and tagged key life chapters.', quest_type: 'main', category: 'personal', tags: ['journal', 'migration'], priority: 8, importance: 8, impact: 8, completedDaysAgo: 7, durationDays: 6, source: 'extracted' },
  { title: 'Complete Client Retainer Renewal', description: 'Negotiated and signed renewed six-month retainer.', quest_type: 'main', category: 'career', tags: ['client', 'income'], priority: 9, importance: 9, impact: 9, completedDaysAgo: 3, durationDays: 10 },
  { title: 'Finish Annual Health Checkup', description: 'Completed physical, labs, and follow-up plan.', quest_type: 'side', category: 'health', tags: ['health', 'checkup'], priority: 7, importance: 8, impact: 6, completedDaysAgo: 50, durationDays: 14 },
  { title: 'Build Sample Pack for Drums', description: 'Recorded and packaged 24 one-shot samples for EP production.', quest_type: 'side', category: 'creative', tags: ['samples', 'drums'], priority: 6, importance: 6, impact: 6, completedDaysAgo: 30, durationDays: 9 },
  { title: 'Complete 50 Push-Up Challenge', description: 'Worked up to 50 consecutive push-ups over four weeks.', quest_type: 'achievement', category: 'health', tags: ['fitness', 'challenge'], priority: 5, importance: 5, impact: 5, completedDaysAgo: 115, durationDays: 28 },
  { title: 'Organize Music Sample Library', description: 'Tagged 800+ samples and removed duplicates.', quest_type: 'side', category: 'creative', tags: ['samples', 'organization'], priority: 5, importance: 5, impact: 5, completedDaysAgo: 62, durationDays: 4 },
  { title: 'Write Thank-You Notes Post-Launch', description: 'Sent personalized notes to everyone who supported EP preview.', quest_type: 'side', category: 'relationships', tags: ['gratitude', 'community'], priority: 4, importance: 5, impact: 4, completedDaysAgo: 16, durationDays: 2 },
  { title: 'Complete Intro to Ableton Course', description: 'Finished DAW workflow modules and built practice arrangement.', quest_type: 'side', category: 'education', tags: ['ableton', 'music'], priority: 7, importance: 7, impact: 7, completedDaysAgo: 175, durationDays: 21 },
  { title: 'Plan Weekly Creative Review Ritual', description: 'Established Sunday review for goals, habits, and next steps.', quest_type: 'daily', category: 'productivity', tags: ['review', 'habits'], priority: 6, importance: 7, impact: 6, completedDaysAgo: 45, durationDays: 7 },
  { title: 'Deliver Brand Assets to Café Client', description: 'Handed off logo variants, color tokens, and usage guide.', quest_type: 'main', category: 'career', tags: ['branding', 'client'], priority: 8, importance: 8, impact: 8, completedDaysAgo: 9, durationDays: 21 },
  { title: 'Complete Digital Detox Weekend', description: 'Unplugged for 48 hours and journaled reflections after.', quest_type: 'side', category: 'health', tags: ['detox', 'mindfulness'], priority: 5, importance: 6, impact: 5, completedDaysAgo: 58, durationDays: 2 },
];

function makeCompletedQuest(id: string, t: CompletedTemplate): Quest {
  const completedAt = daysAgo(t.completedDaysAgo);
  const startedAt = daysAgo(t.completedDaysAgo + t.durationDays);
  const hours = Math.max(2, Math.round(t.durationDays * 1.5 + t.impact));
  return {
    id,
    user_id: 'user-1',
    title: t.title,
    description: t.description,
    quest_type: t.quest_type,
    priority: t.priority,
    importance: t.importance,
    impact: t.impact,
    difficulty: Math.min(9, Math.max(3, Math.round(t.impact * 0.8))),
    effort_hours: hours,
    status: 'completed',
    started_at: startedAt.toISOString(),
    completed_at: completedAt.toISOString(),
    progress_percentage: 100,
    completion_notes: t.completionNotes ?? 'Completed and logged in Quest Log.',
    milestones: [
      { id: 'm1', description: 'Started quest', achieved: true, achieved_at: startedAt.toISOString() },
      { id: 'm2', description: 'Reached midpoint', achieved: true, achieved_at: daysAgo(t.completedDaysAgo + Math.floor(t.durationDays / 2)).toISOString() },
      { id: 'm3', description: 'Finished quest', achieved: true, achieved_at: completedAt.toISOString() },
    ],
    reward_description: 'Another chapter closed — progress you can see.',
    motivation_notes: 'Logged from conversations and journal entries.',
    estimated_completion_date: completedAt.toISOString(),
    actual_completion_date: completedAt.toISOString(),
    time_spent_hours: hours,
    tags: t.tags,
    category: t.category,
    source: t.source ?? 'extracted',
    created_at: startedAt.toISOString(),
    updated_at: completedAt.toISOString(),
    last_activity_at: completedAt.toISOString(),
  };
}

export const MOCK_COMPLETED_QUESTS: Quest[] = COMPLETED_QUEST_TEMPLATES.map((t, i) =>
  makeCompletedQuest(`quest-completed-${i + 1}`, t)
);

const MOCK_IN_PROGRESS_QUESTS: Quest[] = [
  {
    id: 'quest-1',
    user_id: 'user-1',
    title: 'Build Creative Portfolio Website',
    description: 'Create a modern, responsive portfolio website showcasing my music production, writing, and photography work. Include case studies, audio samples, and a contact form. This is part of my transition from tech to creative work.',
    quest_type: 'main',
    priority: 9,
    importance: 8,
    impact: 7,
    difficulty: 6,
    effort_hours: 40,
    status: 'active',
    started_at: lastWeek.toISOString(),
    progress_percentage: 45,
    milestones: [
      { id: 'm1', description: 'Design wireframes and mockups', achieved: true, achieved_at: lastWeek.toISOString() },
      { id: 'm2', description: 'Set up development environment', achieved: true, achieved_at: new Date(lastWeek.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString() },
      { id: 'm3', description: 'Build responsive layout', achieved: false },
      { id: 'm4', description: 'Add music samples and writing portfolio', achieved: false },
      { id: 'm5', description: 'Deploy to production', achieved: false },
    ],
    reward_description: 'Professional online presence for creative work, potential music/writing opportunities',
    motivation_notes: 'Marcus and Sarah both think I need a portfolio to showcase my creative work. This will help me transition fully from tech to creative work and potentially land freelance projects.',
    estimated_completion_date: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    time_spent_hours: 18,
    tags: ['web-development', 'portfolio', 'career'],
    category: 'career',
    related_goal_id: 'goal-creative-transition',
    source: 'manual',
    created_at: lastWeek.toISOString(),
    updated_at: yesterday.toISOString(),
    last_activity_at: yesterday.toISOString(),
  },
  {
    id: 'quest-2',
    user_id: 'user-1',
    title: 'Complete Music Production Course',
    description: 'Finish the music production course Marcus recommended. Focus on sound design, mixing, and mastering. Alex Rivera is helping me practice in my home studio.',
    quest_type: 'main',
    priority: 8,
    importance: 7,
    impact: 8,
    difficulty: 5,
    effort_hours: 30,
    status: 'active',
    started_at: new Date(now.getTime() - 730 * 24 * 60 * 60 * 1000).toISOString(),
    progress_percentage: 70,
    milestones: [
      { id: 'm1', description: 'Complete sound design section', achieved: true, achieved_at: new Date(now.getTime() - 600 * 24 * 60 * 60 * 1000).toISOString() },
      { id: 'm2', description: 'Complete mixing section', achieved: true, achieved_at: new Date(now.getTime() - 400 * 24 * 60 * 60 * 1000).toISOString() },
      { id: 'm3', description: 'Complete mastering section', achieved: false },
      { id: 'm4', description: 'Produce final track with Alex Rivera', achieved: false },
    ],
    reward_description: 'Deep understanding of music production, improved creative skills',
    motivation_notes: 'Marcus encouraged me to take this course as part of my creative transition. Alex Rivera is helping me practice, and Alex (my girlfriend) is supportive of this journey.',
    estimated_completion_date: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    time_spent_hours: 21,
    tags: ['learning', 'react', 'programming'],
    category: 'education',
    source: 'manual',
    created_at: lastMonth.toISOString(),
    updated_at: yesterday.toISOString(),
    last_activity_at: yesterday.toISOString(),
  },
  {
    id: 'quest-3',
    user_id: 'user-1',
    title: 'Organize Home Studio',
    description: 'Declutter and organize my home studio space. Set up proper cable management for music equipment and create an inspiring creative workspace. Alex (my girlfriend) is helping me with this.',
    quest_type: 'side',
    priority: 6,
    importance: 5,
    impact: 4,
    difficulty: 3,
    effort_hours: 8,
    status: 'active',
    started_at: yesterday.toISOString(),
    progress_percentage: 20,
    milestones: [
      { id: 'm1', description: 'Sort through music equipment and cables', achieved: false },
      { id: 'm2', description: 'Organize studio setup and cable management', achieved: false },
      { id: 'm3', description: 'Add plants and creative inspiration', achieved: false },
    ],
    reward_description: 'Clean, organized creative workspace that boosts music production and writing',
    motivation_notes: 'A clean and organized studio helps me focus better on creative work. Alex Rivera and I work here together, so it needs to be functional.',
    tags: ['home', 'organization', 'productivity'],
    category: 'personal',
    source: 'manual',
    created_at: yesterday.toISOString(),
    updated_at: yesterday.toISOString(),
    last_activity_at: yesterday.toISOString(),
  },
  {
    id: 'quest-4',
    user_id: 'user-1',
    title: 'Daily Exercise Routine',
    description: 'Complete 30 minutes of exercise every day. Mix of cardio and strength training.',
    quest_type: 'daily',
    priority: 7,
    importance: 9,
    impact: 8,
    difficulty: 4,
    effort_hours: 0.5,
    status: 'active',
    started_at: lastWeek.toISOString(),
    progress_percentage: 85,
    milestones: [
      { id: 'm1', description: 'Complete 7 days in a row', achieved: true, achieved_at: new Date(lastWeek.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString() },
      { id: 'm2', description: 'Complete 14 days in a row', achieved: false },
      { id: 'm3', description: 'Complete 30 days in a row', achieved: false },
    ],
    reward_description: 'Better health, more energy, improved mood',
    motivation_notes: 'Consistency is key. Building a habit that will improve my overall well-being.',
    tags: ['health', 'fitness', 'daily'],
    category: 'health',
    source: 'manual',
    created_at: lastWeek.toISOString(),
    updated_at: yesterday.toISOString(),
    last_activity_at: yesterday.toISOString(),
  },
  {
    id: 'quest-5',
    user_id: 'user-1',
    title: 'Release First EP',
    description: 'Complete and release my first EP. Work with Alex Rivera on production, finalize all tracks, and release on streaming platforms. This is a major milestone in my music production journey.',
    quest_type: 'main',
    priority: 9,
    importance: 9,
    impact: 9,
    difficulty: 8,
    effort_hours: 100,
    status: 'active',
    started_at: new Date(now.getTime() - 335 * 24 * 60 * 60 * 1000).toISOString(),
    progress_percentage: 60,
    milestones: [
      { id: 'm1', description: 'Complete EP concept and tracklist', achieved: true, achieved_at: new Date(now.getTime() - 335 * 24 * 60 * 60 * 1000).toISOString() },
      { id: 'm2', description: 'Finish all track production with Alex Rivera', achieved: false },
      { id: 'm3', description: 'Complete mixing and mastering', achieved: false },
      { id: 'm4', description: 'Release on streaming platforms', achieved: false },
    ],
    reward_description: 'First creative release, portfolio addition, validation of creative transition',
    motivation_notes: 'This EP represents my transformation from tech to creative work. Marcus, Sarah, and Alex are all supportive. Alex Rivera is helping me produce it. This is what I want to do with my life.',
    tags: ['reading', 'learning', 'personal-growth'],
    category: 'personal',
    source: 'manual',
    created_at: new Date(now.getFullYear(), 0, 1).toISOString(),
    updated_at: yesterday.toISOString(),
    last_activity_at: yesterday.toISOString(),
  },
  {
    id: 'quest-6',
    user_id: 'user-1',
    title: 'Learn TypeScript',
    description: 'Master TypeScript fundamentals and advanced patterns. Build a small project to practice.',
    quest_type: 'side',
    priority: 7,
    importance: 7,
    impact: 7,
    difficulty: 6,
    effort_hours: 25,
    status: 'paused',
    started_at: lastMonth.toISOString(),
    progress_percentage: 30,
    milestones: [
      { id: 'm1', description: 'Complete basics course', achieved: true, achieved_at: new Date(lastMonth.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString() },
      { id: 'm2', description: 'Learn advanced types', achieved: false },
      { id: 'm3', description: 'Build practice project', achieved: false },
    ],
    reward_description: 'Type safety, better code quality',
    motivation_notes: 'Paused due to other priorities, will resume soon.',
    tags: ['learning', 'typescript', 'programming'],
    category: 'education',
    source: 'manual',
    created_at: lastMonth.toISOString(),
    updated_at: new Date(lastMonth.getTime() + 20 * 24 * 60 * 60 * 1000).toISOString(),
    last_activity_at: new Date(lastMonth.getTime() + 20 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'quest-8',
    user_id: 'user-1',
    title: 'Master Next.js Framework',
    description: 'Deep dive into Next.js 14+ features including App Router, Server Components, and advanced patterns.',
    quest_type: 'main',
    priority: 8,
    importance: 8,
    impact: 8,
    difficulty: 7,
    effort_hours: 35,
    status: 'active',
    started_at: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    progress_percentage: 40,
    milestones: [
      { id: 'm1', description: 'Complete App Router tutorial', achieved: true, achieved_at: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString() },
      { id: 'm2', description: 'Build sample project', achieved: false },
      { id: 'm3', description: 'Deploy to production', achieved: false },
    ],
    reward_description: 'Modern full-stack development skills',
    motivation_notes: 'Next.js is becoming essential for modern web development.',
    tags: ['nextjs', 'web-development', 'learning'],
    category: 'education',
    source: 'extracted',
    created_at: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: yesterday.toISOString(),
    last_activity_at: yesterday.toISOString(),
  },
  {
    id: 'quest-9',
    user_id: 'user-1',
    title: 'Build Side Project: Task Manager',
    description: 'Create a full-featured task management app with React, TypeScript, and a backend API.',
    quest_type: 'side',
    priority: 6,
    importance: 6,
    impact: 7,
    difficulty: 7,
    effort_hours: 50,
    status: 'active',
    started_at: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString(),
    progress_percentage: 25,
    milestones: [
      { id: 'm1', description: 'Design database schema', achieved: true, achieved_at: new Date(now.getTime() - 13 * 24 * 60 * 60 * 1000).toISOString() },
      { id: 'm2', description: 'Build API endpoints', achieved: false },
      { id: 'm3', description: 'Create frontend UI', achieved: false },
      { id: 'm4', description: 'Add authentication', achieved: false },
    ],
    reward_description: 'Portfolio project, learning experience',
    motivation_notes: 'Want to build something useful while learning new technologies.',
    tags: ['project', 'full-stack', 'portfolio'],
    category: 'career',
    source: 'extracted',
    created_at: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: yesterday.toISOString(),
    last_activity_at: yesterday.toISOString(),
  },
  {
    id: 'quest-10',
    user_id: 'user-1',
    title: 'Morning Journaling Habit',
    description: 'Write in journal every morning for 10 minutes. Reflect on goals, gratitude, and daily intentions.',
    quest_type: 'daily',
    priority: 7,
    importance: 8,
    impact: 7,
    difficulty: 3,
    effort_hours: 0.17,
    status: 'active',
    started_at: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    progress_percentage: 60,
    milestones: [
      { id: 'm1', description: 'Complete 5 days in a row', achieved: true, achieved_at: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString() },
      { id: 'm2', description: 'Complete 14 days in a row', achieved: false },
      { id: 'm3', description: 'Complete 30 days in a row', achieved: false },
    ],
    reward_description: 'Better self-awareness, clarity of thought',
    motivation_notes: 'Journaling helps me process thoughts and stay focused on what matters.',
    tags: ['journaling', 'mindfulness', 'daily'],
    category: 'personal',
    source: 'extracted',
    created_at: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: yesterday.toISOString(),
    last_activity_at: yesterday.toISOString(),
  },
  {
    id: 'quest-11',
    user_id: 'user-1',
    title: 'Learn GraphQL',
    description: 'Understand GraphQL fundamentals, build a simple API, and integrate it with a frontend application.',
    quest_type: 'side',
    priority: 6,
    importance: 6,
    impact: 6,
    difficulty: 5,
    effort_hours: 20,
    status: 'active',
    started_at: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    progress_percentage: 15,
    milestones: [
      { id: 'm1', description: 'Complete GraphQL basics course', achieved: false },
      { id: 'm2', description: 'Build sample API', achieved: false },
      { id: 'm3', description: 'Integrate with frontend', achieved: false },
    ],
    reward_description: 'Modern API skills, better data fetching',
    motivation_notes: 'GraphQL is becoming more popular, good to know the basics.',
    tags: ['graphql', 'api', 'learning'],
    category: 'education',
    source: 'extracted',
    created_at: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: yesterday.toISOString(),
    last_activity_at: yesterday.toISOString(),
  },
  {
    id: 'quest-12',
    user_id: 'user-1',
    title: 'Improve Sleep Schedule',
    description: 'Go to bed by 11 PM and wake up at 7 AM consistently. Create a bedtime routine.',
    quest_type: 'daily',
    priority: 8,
    importance: 9,
    impact: 8,
    difficulty: 5,
    effort_hours: 0,
    status: 'active',
    started_at: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    progress_percentage: 50,
    milestones: [
      { id: 'm1', description: 'Maintain schedule for 7 days', achieved: true, achieved_at: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString() },
      { id: 'm2', description: 'Maintain schedule for 14 days', achieved: false },
      { id: 'm3', description: 'Maintain schedule for 30 days', achieved: false },
    ],
    reward_description: 'Better energy, improved focus, overall health',
    motivation_notes: 'Consistent sleep is crucial for productivity and well-being.',
    tags: ['health', 'sleep', 'routine'],
    category: 'health',
    source: 'extracted',
    created_at: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: yesterday.toISOString(),
    last_activity_at: yesterday.toISOString(),
  },
  {
    id: 'quest-13',
    user_id: 'user-1',
    title: 'Complete Docker Course',
    description: 'Learn containerization with Docker. Understand images, containers, and Docker Compose.',
    quest_type: 'side',
    priority: 7,
    importance: 7,
    impact: 7,
    difficulty: 6,
    effort_hours: 15,
    status: 'active',
    started_at: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString(),
    progress_percentage: 30,
    milestones: [
      { id: 'm1', description: 'Complete Docker basics', achieved: true, achieved_at: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString() },
      { id: 'm2', description: 'Learn Docker Compose', achieved: false },
      { id: 'm3', description: 'Containerize a project', achieved: false },
    ],
    reward_description: 'DevOps skills, better deployment practices',
    motivation_notes: 'Docker is essential for modern development workflows.',
    tags: ['docker', 'devops', 'learning'],
    category: 'education',
    source: 'extracted',
    created_at: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: yesterday.toISOString(),
    last_activity_at: yesterday.toISOString(),
  },
  {
    id: 'quest-14',
    user_id: 'user-1',
    title: 'Write Technical Blog Post',
    description: 'Write and publish a technical blog post about a recent project or learning experience.',
    quest_type: 'side',
    priority: 5,
    importance: 6,
    impact: 5,
    difficulty: 4,
    effort_hours: 8,
    status: 'active',
    started_at: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    progress_percentage: 20,
    milestones: [
      { id: 'm1', description: 'Choose topic and outline', achieved: true, achieved_at: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString() },
      { id: 'm2', description: 'Write first draft', achieved: false },
      { id: 'm3', description: 'Edit and publish', achieved: false },
    ],
    reward_description: 'Personal brand, knowledge sharing',
    motivation_notes: 'Writing helps solidify learning and builds online presence.',
    tags: ['writing', 'blogging', 'career'],
    category: 'career',
    source: 'extracted',
    created_at: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: yesterday.toISOString(),
    last_activity_at: yesterday.toISOString(),
  },
  {
    id: 'quest-15',
    user_id: 'user-1',
    title: 'Learn Tailwind CSS Advanced',
    description: 'Master advanced Tailwind CSS patterns, custom configurations, and component composition.',
    quest_type: 'side',
    priority: 5,
    importance: 5,
    impact: 5,
    difficulty: 4,
    effort_hours: 12,
    status: 'paused',
    started_at: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString(),
    progress_percentage: 40,
    milestones: [
      { id: 'm1', description: 'Complete basics review', achieved: true, achieved_at: new Date(now.getTime() - 18 * 24 * 60 * 60 * 1000).toISOString() },
      { id: 'm2', description: 'Learn custom configurations', achieved: false },
      { id: 'm3', description: 'Build complex components', achieved: false },
    ],
    reward_description: 'Faster UI development',
    motivation_notes: 'Paused to focus on higher priority quests.',
    tags: ['tailwind', 'css', 'learning'],
    category: 'education',
    source: 'manual',
    created_at: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    last_activity_at: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'quest-16',
    user_id: 'user-1',
    title: 'Weekly Meal Prep',
    description: 'Prepare healthy meals for the week every Sunday. Focus on balanced nutrition.',
    quest_type: 'daily',
    priority: 6,
    importance: 7,
    impact: 6,
    difficulty: 4,
    effort_hours: 2,
    status: 'active',
    started_at: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    progress_percentage: 70,
    milestones: [
      { id: 'm1', description: 'Complete 2 weeks of meal prep', achieved: true, achieved_at: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString() },
      { id: 'm2', description: 'Complete 4 weeks of meal prep', achieved: false },
      { id: 'm3', description: 'Complete 8 weeks of meal prep', achieved: false },
    ],
    reward_description: 'Better nutrition, time savings, healthier lifestyle',
    motivation_notes: 'Meal prep saves time during the week and ensures I eat well.',
    tags: ['health', 'cooking', 'routine'],
    category: 'health',
    source: 'extracted',
    created_at: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: yesterday.toISOString(),
    last_activity_at: yesterday.toISOString(),
  },
  {
    id: 'quest-17',
    user_id: 'user-1',
    title: 'Build Personal API',
    description: 'Create a RESTful API for personal projects. Include authentication, database, and documentation.',
    quest_type: 'side',
    priority: 6,
    importance: 6,
    impact: 6,
    difficulty: 7,
    effort_hours: 30,
    status: 'active',
    started_at: new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString(),
    progress_percentage: 10,
    milestones: [
      { id: 'm1', description: 'Design API structure', achieved: false },
      { id: 'm2', description: 'Implement endpoints', achieved: false },
      { id: 'm3', description: 'Add authentication', achieved: false },
      { id: 'm4', description: 'Write documentation', achieved: false },
    ],
    reward_description: 'Reusable API, learning experience',
    motivation_notes: 'Having a personal API will be useful for future projects.',
    tags: ['api', 'backend', 'project'],
    category: 'career',
    source: 'extracted',
    created_at: new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: yesterday.toISOString(),
    last_activity_at: yesterday.toISOString(),
  },
  {
    id: 'quest-18',
    user_id: 'user-1',
    title: 'Complete 100 Days of Code Challenge',
    description: 'Code for at least 1 hour every day for 100 days. Share progress on social media.',
    quest_type: 'achievement',
    priority: 7,
    importance: 8,
    impact: 8,
    difficulty: 8,
    effort_hours: 100,
    status: 'active',
    started_at: new Date(now.getTime() - 25 * 24 * 60 * 60 * 1000).toISOString(),
    progress_percentage: 25,
    milestones: [
      { id: 'm1', description: 'Complete 25 days', achieved: true, achieved_at: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString() },
      { id: 'm2', description: 'Complete 50 days', achieved: false },
      { id: 'm3', description: 'Complete 75 days', achieved: false },
      { id: 'm4', description: 'Complete 100 days', achieved: false },
    ],
    reward_description: 'Strong coding habit, improved skills, online presence',
    motivation_notes: 'Consistent practice is the key to mastery.',
    tags: ['coding', 'challenge', 'learning'],
    category: 'education',
    source: 'extracted',
    created_at: new Date(now.getTime() - 25 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: yesterday.toISOString(),
    last_activity_at: yesterday.toISOString(),
  },
  {
    id: 'quest-19',
    user_id: 'user-1',
    title: 'Learn Python for Data Science',
    description: 'Master Python fundamentals and data science libraries like Pandas, NumPy, and Matplotlib.',
    quest_type: 'side',
    priority: 5,
    importance: 6,
    impact: 6,
    difficulty: 6,
    effort_hours: 40,
    status: 'active',
    started_at: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    progress_percentage: 20,
    milestones: [
      { id: 'm1', description: 'Complete Python basics', achieved: false },
      { id: 'm2', description: 'Learn Pandas', achieved: false },
      { id: 'm3', description: 'Build data analysis project', achieved: false },
    ],
    reward_description: 'Data analysis skills, new career opportunities',
    motivation_notes: 'Data science is an interesting field to explore.',
    tags: ['python', 'data-science', 'learning'],
    category: 'education',
    source: 'extracted',
    created_at: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: yesterday.toISOString(),
    last_activity_at: yesterday.toISOString(),
  },
  {
    id: 'quest-20',
    user_id: 'user-1',
    title: 'Complete Mobile App Project',
    description: 'Build a mobile app using React Native. Include authentication, API integration, and native features.',
    quest_type: 'main',
    priority: 8,
    importance: 8,
    impact: 8,
    difficulty: 8,
    effort_hours: 60,
    status: 'active',
    started_at: new Date(now.getTime() - 12 * 24 * 60 * 60 * 1000).toISOString(),
    progress_percentage: 35,
    milestones: [
      { id: 'm1', description: 'Set up React Native project', achieved: true, achieved_at: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString() },
      { id: 'm2', description: 'Implement core features', achieved: false },
      { id: 'm3', description: 'Add authentication', achieved: false },
      { id: 'm4', description: 'Test and deploy', achieved: false },
    ],
    reward_description: 'Mobile development skills, portfolio project',
    motivation_notes: 'Mobile apps are in high demand, good skill to have.',
    tags: ['react-native', 'mobile', 'project'],
    category: 'career',
    source: 'extracted',
    created_at: new Date(now.getTime() - 12 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: yesterday.toISOString(),
    last_activity_at: yesterday.toISOString(),
  },
];

export const MOCK_QUESTS: Quest[] = [
  ...MOCK_IN_PROGRESS_QUESTS,
  ...MOCK_COMPLETED_QUESTS,
];

// Calculate time-based quests for mock data
const calculateTodaysQuests = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return MOCK_QUESTS.filter(q => {
    if (q.last_activity_at) {
      const lastActivity = new Date(q.last_activity_at);
      lastActivity.setHours(0, 0, 0, 0);
      if (lastActivity.getTime() === today.getTime()) return true;
    }
    if (q.estimated_completion_date) {
      const dueDate = new Date(q.estimated_completion_date);
      dueDate.setHours(0, 0, 0, 0);
      if (dueDate.getTime() === today.getTime()) return true;
    }
    return false;
  });
};

const calculateThisWeeksQuests = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekEnd = new Date(today);
  weekEnd.setDate(today.getDate() + 7);
  return MOCK_QUESTS.filter(q => {
    if (q.estimated_completion_date && q.status !== 'completed' && q.status !== 'archived') {
      const dueDate = new Date(q.estimated_completion_date);
      dueDate.setHours(0, 0, 0, 0);
      return dueDate >= today && dueDate <= weekEnd;
    }
    return false;
  });
};

/** Build a quest board view from any quest list (used when adding mock quests). */
export function buildQuestBoardFromQuests(quests: Quest[]): QuestBoard {
  const todays = (() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return quests.filter(q => {
      if (q.last_activity_at) {
        const lastActivity = new Date(q.last_activity_at);
        lastActivity.setHours(0, 0, 0, 0);
        if (lastActivity.getTime() === today.getTime()) return true;
      }
      if (q.estimated_completion_date) {
        const dueDate = new Date(q.estimated_completion_date);
        dueDate.setHours(0, 0, 0, 0);
        if (dueDate.getTime() === today.getTime()) return true;
      }
      return false;
    });
  })();

  const thisWeek = (() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekEnd = new Date(today);
    weekEnd.setDate(today.getDate() + 7);
    return quests.filter(q => {
      if (q.estimated_completion_date && q.status !== 'completed' && q.status !== 'archived') {
        const dueDate = new Date(q.estimated_completion_date);
        dueDate.setHours(0, 0, 0, 0);
        return dueDate >= today && dueDate <= weekEnd;
      }
      return false;
    });
  })();

  return {
    todays_quests: todays,
    this_weeks_quests: thisWeek,
    main_quests: quests.filter(q => q.quest_type === 'main' && q.status !== 'completed' && q.status !== 'archived'),
    side_quests: quests.filter(q => q.quest_type === 'side' && q.status !== 'completed' && q.status !== 'archived'),
    daily_quests: quests.filter(q => q.quest_type === 'daily' && q.status !== 'completed' && q.status !== 'archived'),
    completed_quests: quests.filter(q => q.status === 'completed'),
    total_count: quests.length,
  };
}

export const MOCK_QUEST_BOARD: QuestBoard = {
  todays_quests: calculateTodaysQuests(),
  this_weeks_quests: calculateThisWeeksQuests(),
  main_quests: MOCK_QUESTS.filter(q => q.quest_type === 'main' && q.status !== 'completed'),
  side_quests: MOCK_QUESTS.filter(q => q.quest_type === 'side' && q.status !== 'completed'),
  daily_quests: MOCK_QUESTS.filter(q => q.quest_type === 'daily' && q.status !== 'completed'), // Keep for compatibility
  completed_quests: MOCK_QUESTS.filter(q => q.status === 'completed'),
  total_count: MOCK_QUESTS.length,
};

/** Demo quest timeline events derived from mock quest fields. */
export function getMockQuestHistory(quest: Quest): QuestHistory[] {
  const events: QuestHistory[] = [
    {
      id: `${quest.id}-created`,
      quest_id: quest.id,
      event_type: 'created',
      description: `Quest "${quest.title}" added to your log`,
      progress_after: 0,
      created_at: quest.created_at,
    },
  ];

  if (quest.started_at) {
    events.push({
      id: `${quest.id}-started`,
      quest_id: quest.id,
      event_type: 'started',
      description: 'Quest marked active',
      progress_before: 0,
      progress_after: 0,
      created_at: quest.started_at,
    });
  }

  if (quest.source === 'extracted') {
    events.push({
      id: `${quest.id}-detected`,
      quest_id: quest.id,
      event_type: 'auto_detected',
      description: 'Detected from your conversations',
      notes: 'LoreBook matched this goal from chat and journal mentions.',
      created_at: new Date(new Date(quest.created_at).getTime() + 60_000).toISOString(),
    });
  }

  for (const milestone of quest.milestones ?? []) {
    if (milestone.achieved && milestone.achieved_at) {
      events.push({
        id: `${quest.id}-${milestone.id}`,
        quest_id: quest.id,
        event_type: 'milestone',
        description: milestone.description,
        notes: 'Milestone completed',
        created_at: milestone.achieved_at,
      });
    }
  }

  if (quest.last_activity_at) {
    const before = Math.max(0, Math.round(quest.progress_percentage - 10));
    events.push({
      id: `${quest.id}-progress`,
      quest_id: quest.id,
      event_type: 'progress_updated',
      description: 'Progress updated',
      progress_before: before,
      progress_after: quest.progress_percentage,
      notes: quest.motivation_notes ? undefined : 'Updated from activity',
      created_at: quest.last_activity_at,
    });
  }

  if (quest.status === 'paused') {
    events.push({
      id: `${quest.id}-paused`,
      quest_id: quest.id,
      event_type: 'paused',
      description: 'Quest paused',
      progress_before: quest.progress_percentage,
      progress_after: quest.progress_percentage,
      created_at: quest.updated_at,
    });
  }

  if (quest.status === 'completed' && quest.completed_at) {
    events.push({
      id: `${quest.id}-completed`,
      quest_id: quest.id,
      event_type: 'completed',
      description: quest.completion_notes ?? 'Quest completed',
      progress_before: quest.progress_percentage,
      progress_after: 100,
      created_at: quest.completed_at,
    });
  }

  return events.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

export const MOCK_QUEST_ANALYTICS: QuestAnalytics = {
  total_quests: MOCK_QUESTS.length,
  active_quests: MOCK_QUESTS.filter(q => q.status === 'active').length,
  completed_quests: MOCK_QUESTS.filter(q => q.status === 'completed').length,
  abandoned_quests: MOCK_QUESTS.filter(q => q.status === 'abandoned').length,
  by_type: {
    main: MOCK_QUESTS.filter(q => q.quest_type === 'main').length,
    side: MOCK_QUESTS.filter(q => q.quest_type === 'side').length,
    daily: MOCK_QUESTS.filter(q => q.quest_type === 'daily').length,
    achievement: MOCK_QUESTS.filter(q => q.quest_type === 'achievement').length,
  },
  by_status: {
    active: MOCK_QUESTS.filter(q => q.status === 'active').length,
    paused: MOCK_QUESTS.filter(q => q.status === 'paused').length,
    completed: MOCK_QUESTS.filter(q => q.status === 'completed').length,
    abandoned: MOCK_QUESTS.filter(q => q.status === 'abandoned').length,
    archived: MOCK_QUESTS.filter(q => q.status === 'archived').length,
  },
  average_completion_time_hours: 28,
  completion_rate: MOCK_QUESTS.filter(q => q.status === 'completed').length / MOCK_QUESTS.length,
  average_priority: MOCK_QUESTS.reduce((sum, q) => sum + q.priority, 0) / MOCK_QUESTS.length,
  average_importance: MOCK_QUESTS.reduce((sum, q) => sum + q.importance, 0) / MOCK_QUESTS.length,
  average_impact: MOCK_QUESTS.reduce((sum, q) => sum + q.impact, 0) / MOCK_QUESTS.length,
  most_impactful_quests: MOCK_QUESTS.sort((a, b) => b.impact - a.impact).slice(0, 3),
  quest_activity_timeline: [
    { date: daysAgo(180).toISOString().split('T')[0], created: 4, completed: 2, abandoned: 0 },
    { date: daysAgo(90).toISOString().split('T')[0], created: 3, completed: 5, abandoned: 0 },
    { date: daysAgo(30).toISOString().split('T')[0], created: 2, completed: 8, abandoned: 0 },
    { date: daysAgo(7).toISOString().split('T')[0], created: 1, completed: 3, abandoned: 0 },
    { date: yesterday.toISOString().split('T')[0], created: 0, completed: 2, abandoned: 0 },
  ],
};

export const MOCK_QUEST_SUGGESTIONS: QuestSuggestion[] = [
  // High-confidence "detected" quests — pulled almost verbatim from recent chats.
  {
    id: 'mock-qs-finish-ep',
    title: 'Finish Mixing the EP',
    description: 'You and Alex Rivera have three of five tracks mixed. Block studio time to finish the last two and lock the master.',
    quest_type: 'main',
    priority: 9,
    importance: 9,
    impact: 9,
    confidence: 0.94,
    reasoning: 'You keep returning to the EP in conversation and mentioned only two tracks remain before mastering.',
    source_entry_id: 'mock-chat-ep-session',
  },
  {
    id: 'mock-qs-cafe-referral',
    title: 'Ask the Café Client for a Referral',
    description: 'The branding handoff went well. Follow up to ask if they know other local businesses who need similar work.',
    quest_type: 'side',
    priority: 8,
    importance: 8,
    impact: 8,
    confidence: 0.89,
    reasoning: 'You said the café owner was thrilled with the brand assets — a warm referral is the fastest path to your next contract.',
    source_entry_id: 'mock-chat-cafe-handoff',
  },
  {
    id: 'mock-qs-cowrite-alex',
    title: 'Plan a Co-Writing Session with Alex Rivera',
    description: 'Schedule a dedicated writing block to start the next batch of songs while the momentum from the EP is still fresh.',
    quest_type: 'side',
    priority: 7,
    importance: 8,
    impact: 7,
    confidence: 0.86,
    reasoning: 'You and Alex have collaborated well on the demo reel and EP; you mentioned wanting to "keep writing before the spark fades."',
    source_entry_id: 'mock-chat-alex-cowrite',
  },
  {
    id: 'mock-qs-tax-buffer',
    title: 'Set Up a Quarterly Tax Savings Buffer',
    description: 'Now that freelance income is steady, move a fixed percentage of each payment into a separate tax account.',
    quest_type: 'main',
    priority: 8,
    importance: 9,
    impact: 8,
    confidence: 0.83,
    reasoning: 'You filed last year\'s taxes manually and flagged how stressful the lump sum was — automating savings prevents a repeat.',
    source_entry_id: 'mock-chat-freelance-income',
  },
  // Mid-confidence "suggested" quests — AI inferences from patterns across your story.
  {
    id: 'mock-qs-newsletter-growth',
    title: 'Grow Signal & Story to 500 Subscribers',
    description: 'Your newsletter has momentum after three issues. Set a concrete subscriber target and a simple weekly promotion habit.',
    quest_type: 'main',
    priority: 7,
    importance: 8,
    impact: 8,
    confidence: 0.78,
    reasoning: 'You launched the newsletter recently and it ties directly to your goal of building a creative income stream.',
  },
  {
    id: 'mock-qs-ep-release-plan',
    title: 'Draft an EP Release Plan',
    description: 'Map out the release: distribution, cover art, a single, and a small launch showcase with Marcus and friends.',
    quest_type: 'side',
    priority: 7,
    importance: 7,
    impact: 7,
    confidence: 0.74,
    reasoning: 'With the EP nearly mixed, a release plan turns finished tracks into an actual launch rather than files on a drive.',
  },
  {
    id: 'mock-qs-strength-training',
    title: 'Add a Twice-Weekly Strength Routine',
    description: 'You\'ve kept up running and the meditation streak — pairing in two short strength sessions rounds out your health habits.',
    quest_type: 'daily',
    priority: 5,
    importance: 6,
    impact: 6,
    confidence: 0.68,
    reasoning: 'Your health quests (5K, meditation, sleep) show consistency; strength work is a natural next step you haven\'t started.',
  },
];
