import { useState, useMemo, useEffect } from 'react';
import { Search, Plus, User, RefreshCw, ChevronLeft, ChevronRight, BookOpen, Users, Heart, GraduationCap, Briefcase, Palette, MessageSquare, Link2, UserX, Eye, Star, DollarSign, Activity, Smile, Home, Heart as HeartIcon, Tag } from 'lucide-react';
import { CharacterProfileCard, type Character } from './CharacterProfileCard';
import { CharacterBookPage } from './CharacterBookPage';
import { CharacterDetailModal } from './CharacterDetailModal';
import { UserProfile } from './UserProfile';
import { MemoryDetailModal } from '../memory-explorer/MemoryDetailModal';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Card, CardContent } from '../ui/card';
import { CharacterCardSkeleton } from '../ui/skeleton';
import { Badge } from '../ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { fetchJson } from '../../lib/api';
import { useLoreKeeper } from '../../hooks/useLoreKeeper';
import { ColorCodedTimeline } from '../timeline/ColorCodedTimeline';
import { memoryEntryToCard, type MemoryCard } from '../../types/memory';
import { useCharacterExtraction } from '../../hooks/useCharacterExtraction';
import { useConversationStore } from '../../features/chat/hooks/useConversationStore';
import { generateNicknames } from '../../utils/nicknameGenerator';
import { useAuth } from '../../lib/supabase';
import { mockDataService } from '../../services/mockDataService';
import { useMockData } from '../../contexts/MockDataContext';
import { getMockRomanticRelationships } from '../../mocks/romanticRelationships';

// Comprehensive mock character data showcasing all app capabilities
// Export for use in mock data service
export const dummyCharacters: Character[] = [
  {
    id: 'dummy-1',
    name: 'Sarah Chen',
    first_name: 'Sarah',
    last_name: 'Chen',
    alias: ['Sarah', 'Sara'],
    pronouns: 'she/her',
    archetype: 'ally',
    role: 'Best Friend',
    status: 'active',
    importance_level: 'major',
    importance_score: 87,
    is_nickname: false,
    summary: 'My closest friend and confidante. We met in college and have been inseparable ever since. Sarah is incredibly supportive, honest, and always knows how to make me laugh.',
    tags: ['friendship', 'support', 'honesty', 'loyalty'],
    metadata: {
      relationship_type: 'friend',
      closeness_score: 95,
      first_met: '2018-09-15'
    },
    social_media: {
      email: 'sarah.chen@example.com',
      instagram: '@sarah_life'
    },
    memory_count: 24,
    relationship_count: 8
  },
  {
    id: 'dummy-2',
    name: 'Marcus Johnson',
    first_name: 'Marcus',
    last_name: 'Johnson',
    alias: ['Marcus', 'Marc'],
    pronouns: 'he/him',
    archetype: 'mentor',
    role: 'Mentor & Coach',
    status: 'active',
    importance_level: 'major',
    importance_score: 82,
    is_nickname: false,
    summary: 'A wise mentor who has guided me through many career and life decisions. Marcus has decades of experience and always provides thoughtful, nuanced advice.',
    tags: ['mentorship', 'wisdom', 'career', 'guidance'],
    metadata: {
      relationship_type: 'coach',
      closeness_score: 85,
      first_met: '2020-03-10'
    },
    social_media: {
      email: 'marcus@example.com',
      linkedin: 'marcus-johnson'
    },
    memory_count: 18,
    relationship_count: 5
  },
  {
    id: 'dummy-3',
    name: 'Alex Rivera',
    first_name: 'Alex',
    last_name: 'Rivera',
    alias: ['Alex', 'A.R.'],
    pronouns: 'they/them',
    archetype: 'collaborator',
    role: 'Creative Collaborator',
    status: 'active',
    importance_level: 'supporting',
    importance_score: 65,
    is_nickname: false,
    summary: 'A talented creative collaborator I\'ve worked with on several projects. Alex brings fresh perspectives and we complement each other\'s skills well.',
    tags: ['collaboration', 'creativity', 'professional', 'innovation'],
    metadata: {
      relationship_type: 'professional',
      closeness_score: 75,
      first_met: '2021-07-20'
    },
    social_media: {
      github: 'alex-dev',
      website: 'alexrivera.dev'
    },
    memory_count: 12,
    relationship_count: 3
  },
  {
    id: 'dummy-4',
    name: 'Jordan Kim',
    first_name: 'Jordan',
    last_name: 'Kim',
    alias: ['Jordan', 'J'],
    pronouns: 'they/them',
    archetype: 'family',
    role: 'Sibling',
    status: 'active',
    importance_level: 'protagonist',
    importance_score: 95,
    is_nickname: false,
    summary: 'My sibling and one of the most important people in my life. We\'ve grown closer over the years and now have deep, meaningful conversations about life, dreams, and everything in between.',
    tags: ['family', 'sibling', 'support', 'connection'],
    metadata: {
      relationship_type: 'family',
      closeness_score: 90,
      first_met: '1995-06-15'
    },
    memory_count: 32,
    relationship_count: 12
  },
  {
    id: 'dummy-5',
    name: 'Dr. Maya Patel',
    first_name: 'Maya',
    last_name: 'Patel',
    alias: ['Maya', 'Dr. Patel'],
    pronouns: 'she/her',
    archetype: 'mentor',
    role: 'Life Coach',
    status: 'active',
    importance_level: 'supporting',
    importance_score: 68,
    is_nickname: false,
    summary: 'A life coach who has helped me navigate personal challenges and develop better self-awareness. Her coaching style is gentle but direct, and she has a gift for asking the right questions.',
    tags: ['coaching', 'growth', 'self-awareness', 'wellness'],
    metadata: {
      relationship_type: 'coach',
      closeness_score: 80,
      first_met: '2022-01-15'
    },
    social_media: {
      website: 'mayacoaching.com',
      email: 'maya@coaching.com'
    },
    memory_count: 15,
    relationship_count: 4
  },
  {
    id: 'dummy-6',
    name: 'David Martinez',
    first_name: 'David',
    last_name: 'Martinez',
    alias: generateNicknames('David Martinez', 'A close friend from my photography class. David has an incredible eye for composition and always pushes me to see things from new angles.', 'Photography Partner', ['photography', 'creativity', 'friendship']),
    pronouns: 'he/him',
    archetype: 'friend',
    role: 'Photography Partner',
    status: 'active',
    importance_level: 'supporting',
    importance_score: 58,
    is_nickname: false,
    summary: 'A close friend from my photography class. David has an incredible eye for composition and always pushes me to see things from new angles.',
    tags: ['photography', 'creativity', 'friendship', 'art'],
    metadata: {
      relationship_type: 'friend',
      closeness_score: 76,
      first_met: '2021-04-12'
    },
    social_media: {
      instagram: '@david_photography'
    },
    memory_count: 16,
    relationship_count: 3
  },
  {
    id: 'dummy-7',
    name: 'Sophia Anderson',
    first_name: 'Sophia',
    last_name: 'Anderson',
    alias: generateNicknames('Sophia Anderson', 'A brilliant writer I met at a workshop. Her feedback is always insightful and she\'s helped me improve my craft significantly.', 'Writing Mentor', ['writing', 'mentorship', 'creativity']),
    pronouns: 'she/her',
    archetype: 'mentor',
    role: 'Writing Mentor',
    status: 'active',
    importance_level: 'major',
    importance_score: 79,
    is_nickname: false,
    summary: 'A brilliant writer I met at a workshop. Her feedback is always insightful and she\'s helped me improve my craft significantly.',
    tags: ['writing', 'mentorship', 'creativity', 'feedback'],
    metadata: {
      relationship_type: 'professional',
      closeness_score: 81,
      first_met: '2020-11-20'
    },
    social_media: {
      twitter: '@sophia_writes',
      website: 'sophiaanderson.com'
    },
    memory_count: 27,
    relationship_count: 2
  },
  {
    id: 'dummy-8',
    name: 'Emma Thompson',
    first_name: 'Emma',
    last_name: 'Thompson',
    alias: generateNicknames('Emma Thompson', 'A friend from my writing group. We share a passion for storytelling and often exchange feedback on each other\'s work. Her perspective is always valuable.', 'Friend', ['friendship', 'writing', 'creativity', 'community']),
    pronouns: 'she/her',
    archetype: 'friend',
    role: 'Friend',
    status: 'active',
    importance_level: 'minor',
    importance_score: 42,
    is_nickname: false,
    summary: 'A friend from my writing group. We share a passion for storytelling and often exchange feedback on each other\'s work. Her perspective is always valuable.',
    tags: ['friendship', 'writing', 'creativity', 'community'],
    metadata: {
      relationship_type: 'friend',
      closeness_score: 70,
      first_met: '2021-11-05'
    },
    social_media: {
      twitter: '@emma_writes'
    },
    memory_count: 9,
    relationship_count: 2
  },
  {
    id: 'dummy-9',
    name: 'Dr. James Mitchell',
    first_name: 'James',
    last_name: 'Mitchell',
    alias: ['James', 'Dr. Mitchell'],
    pronouns: 'he/him',
    archetype: 'mentor',
    role: 'Therapist',
    status: 'active',
    importance_level: 'supporting',
    importance_score: 72,
    is_nickname: false,
    summary: 'My therapist who has helped me navigate anxiety and build emotional resilience. His approach is evidence-based and compassionate.',
    tags: ['therapy', 'mental-health', 'growth', 'support'],
    metadata: {
      relationship_type: 'professional',
      closeness_score: 75,
      first_met: '2022-05-10'
    },
    social_media: {
      website: 'drjamesmitchell.com'
    },
    memory_count: 22,
    relationship_count: 1
  },
  {
    id: 'dummy-10',
    name: 'Luna Martinez',
    first_name: 'Luna',
    last_name: 'Martinez',
    alias: generateNicknames('Luna Martinez', 'A spontaneous friend who always pushes me out of my comfort zone. We\'ve gone on countless adventures together and she\'s taught me to embrace uncertainty.', 'Adventure Partner', ['adventure', 'spontaneity', 'friendship', 'growth']),
    pronouns: 'she/her',
    archetype: 'friend',
    role: 'Adventure Partner',
    status: 'active',
    importance_level: 'major',
    importance_score: 84,
    is_nickname: false,
    summary: 'A spontaneous friend who always pushes me out of my comfort zone. We\'ve gone on countless adventures together and she\'s taught me to embrace uncertainty.',
    tags: ['adventure', 'spontaneity', 'friendship', 'growth'],
    metadata: {
      relationship_type: 'friend',
      closeness_score: 80,
      first_met: '2020-08-20'
    },
    social_media: {
      instagram: '@luna_adventures'
    },
    memory_count: 31,
    relationship_count: 6
  },
  {
    id: 'dummy-11',
    name: 'River Song',
    first_name: 'River',
    last_name: 'Song',
    alias: generateNicknames('River Song', 'A brilliant artist and collaborator. We\'ve worked on several creative projects together and their vision always inspires me to think differently.', 'Creative Partner', ['art', 'creativity', 'collaboration', 'inspiration']),
    pronouns: 'they/them',
    archetype: 'collaborator',
    role: 'Creative Partner',
    status: 'active',
    importance_level: 'supporting',
    importance_score: 61,
    is_nickname: false,
    summary: 'A brilliant artist and collaborator. We\'ve worked on several creative projects together and their vision always inspires me to think differently.',
    tags: ['art', 'creativity', 'collaboration', 'inspiration'],
    metadata: {
      relationship_type: 'professional',
      closeness_score: 72,
      first_met: '2021-03-15'
    },
    social_media: {
      instagram: '@river_creates',
      website: 'riversong.art'
    },
    memory_count: 18,
    relationship_count: 4
  },
  {
    id: 'dummy-12',
    name: 'Noah Thompson',
    first_name: 'Noah',
    last_name: 'Thompson',
    alias: generateNicknames('Noah Thompson', 'A thoughtful friend who always asks the deep questions. Our conversations about life, purpose, and meaning have been transformative.', 'Philosophy Friend', ['philosophy', 'deep-thoughts', 'friendship']),
    pronouns: 'he/him',
    archetype: 'friend',
    role: 'Philosophy Friend',
    status: 'active',
    importance_level: 'supporting',
    importance_score: 63,
    is_nickname: false,
    summary: 'A thoughtful friend who always asks the deep questions. Our conversations about life, purpose, and meaning have been transformative.',
    tags: ['philosophy', 'deep-thoughts', 'friendship', 'conversation'],
    metadata: {
      relationship_type: 'friend',
      closeness_score: 83,
      first_met: '2021-08-30'
    },
    social_media: {
      email: 'noah.thompson@example.com'
    },
    memory_count: 20,
    relationship_count: 4
  },
  {
    id: 'dummy-13',
    name: 'Zoe Chen',
    first_name: 'Zoe',
    last_name: 'Chen',
    alias: generateNicknames('Zoe Chen', 'My cousin and childhood confidante. Even though we live far apart now, we still have the deepest conversations about life, dreams, and family.', 'Cousin', ['family', 'cousin', 'childhood', 'connection']),
    pronouns: 'she/her',
    archetype: 'family',
    role: 'Cousin',
    status: 'active',
    importance_level: 'major',
    importance_score: 89,
    is_nickname: false,
    summary: 'My cousin and childhood confidante. Even though we live far apart now, we still have the deepest conversations about life, dreams, and family.',
    tags: ['family', 'cousin', 'childhood', 'connection'],
    metadata: {
      relationship_type: 'family',
      closeness_score: 88,
      first_met: '1995-01-01'
    },
    social_media: {
      email: 'zoe.chen@example.com'
    },
    memory_count: 28,
    relationship_count: 10
  },
  {
    id: 'dummy-14',
    name: 'Professor Elena Rodriguez',
    first_name: 'Elena',
    last_name: 'Rodriguez',
    alias: ['Prof. Rodriguez', 'Elena'],
    pronouns: 'she/her',
    archetype: 'mentor',
    role: 'Academic Advisor',
    status: 'active',
    importance_level: 'major',
    importance_score: 76,
    is_nickname: false,
    summary: 'My former professor who became a mentor. She saw potential in me when I didn\'t see it in myself and has guided my academic and career journey.',
    tags: ['education', 'mentorship', 'academic', 'guidance'],
    metadata: {
      relationship_type: 'professional',
      closeness_score: 82,
      first_met: '2019-09-01'
    },
    social_media: {
      email: 'elena.rodriguez@university.edu',
      linkedin: 'elena-rodriguez-phd'
    },
    memory_count: 26,
    relationship_count: 3
  },
  {
    id: 'dummy-15',
    name: 'Sam Taylor',
    first_name: 'Sam',
    last_name: 'Taylor',
    alias: generateNicknames('Sam Taylor', 'My workout partner and accountability buddy. We motivate each other to stay active and healthy, and our gym sessions are always filled with great conversations.', 'Gym Buddy', ['fitness', 'health', 'friendship', 'accountability']),
    pronouns: 'they/them',
    archetype: 'friend',
    role: 'Gym Buddy',
    status: 'active',
    importance_level: 'minor',
    importance_score: 38,
    is_nickname: false,
    summary: 'My workout partner and accountability buddy. We motivate each other to stay active and healthy, and our gym sessions are always filled with great conversations.',
    tags: ['fitness', 'health', 'friendship', 'accountability'],
    metadata: {
      relationship_type: 'friend',
      closeness_score: 68,
      first_met: '2022-01-15'
    },
    social_media: {
      instagram: '@sam_fitness'
    },
    memory_count: 14,
    relationship_count: 2
  },
  {
    id: 'dummy-16',
    name: 'Isabella Garcia',
    first_name: 'Isabella',
    last_name: 'Garcia',
    alias: generateNicknames('Isabella Garcia', 'A yoga instructor who has become a close friend. Her calming presence and wisdom about mindfulness have deeply influenced my practice.', 'Yoga Instructor', ['yoga', 'mindfulness', 'wellness', 'friendship']),
    pronouns: 'she/her',
    archetype: 'friend',
    role: 'Yoga Instructor',
    status: 'active',
    importance_level: 'supporting',
    importance_score: 69,
    is_nickname: false,
    summary: 'A yoga instructor who has become a close friend. Her calming presence and wisdom about mindfulness have deeply influenced my practice.',
    tags: ['yoga', 'mindfulness', 'wellness', 'friendship'],
    metadata: {
      relationship_type: 'friend',
      closeness_score: 78,
      first_met: '2022-02-14'
    },
    social_media: {
      instagram: '@isabella_yoga',
      website: 'isabellayoga.com'
    },
    memory_count: 25,
    relationship_count: 3
  },
  {
    id: 'dummy-17',
    name: 'Maya Patel',
    first_name: 'Maya',
    last_name: 'Patel',
    alias: generateNicknames('Maya Patel', 'The organizer of our monthly book club. Her thoughtful discussion questions always lead to deep conversations about literature, life, and everything in between.', 'Book Club Leader', ['books', 'discussion', 'friendship', 'intellectual']),
    pronouns: 'she/her',
    archetype: 'friend',
    role: 'Book Club Leader',
    status: 'active',
    importance_level: 'minor',
    importance_score: 45,
    is_nickname: false,
    summary: 'The organizer of our monthly book club. Her thoughtful discussion questions always lead to deep conversations about literature, life, and everything in between.',
    tags: ['books', 'discussion', 'friendship', 'intellectual'],
    metadata: {
      relationship_type: 'friend',
      closeness_score: 73,
      first_met: '2021-06-10'
    },
    social_media: {
      email: 'maya.bookclub@example.com'
    },
    memory_count: 19,
    relationship_count: 5
  },
  {
    id: 'dummy-18',
    name: 'Alex Kim',
    first_name: 'Alex',
    last_name: 'Kim',
    alias: generateNicknames('Alex Kim', 'My work best friend. We started at the company around the same time and have supported each other through projects, challenges, and career growth.', 'Work Best Friend', ['work', 'colleague', 'friendship', 'professional']),
    pronouns: 'he/him',
    archetype: 'colleague',
    role: 'Work Best Friend',
    status: 'active',
    importance_level: 'supporting',
    importance_score: 56,
    is_nickname: false,
    summary: 'My work best friend. We started at the company around the same time and have supported each other through projects, challenges, and career growth.',
    tags: ['work', 'colleague', 'friendship', 'professional'],
    metadata: {
      relationship_type: 'professional',
      closeness_score: 77,
      first_met: '2021-02-01'
    },
    social_media: {
      linkedin: 'alex-kim-dev'
    },
    memory_count: 21,
    relationship_count: 3
  },
  {
    id: 'dummy-19',
    name: 'Oliver Bennett',
    first_name: 'Oliver',
    last_name: 'Bennett',
    alias: generateNicknames('Oliver Bennett', 'The owner of my favorite bookstore. He has an encyclopedic knowledge of literature and always recommends the perfect book for my mood.', 'Bookstore Owner', ['books', 'literature', 'knowledge', 'community']),
    pronouns: 'he/him',
    archetype: 'friend',
    role: 'Bookstore Owner',
    status: 'active',
    importance_level: 'minor',
    importance_score: 35,
    is_nickname: false,
    summary: 'The owner of my favorite bookstore. He has an encyclopedic knowledge of literature and always recommends the perfect book for my mood.',
    tags: ['books', 'literature', 'knowledge', 'community'],
    metadata: {
      relationship_type: 'friend',
      closeness_score: 71,
      first_met: '2021-05-08'
    },
    social_media: {
      email: 'oliver@bookstore.com'
    },
    memory_count: 14,
    relationship_count: 1
  },
  {
    id: 'dummy-20',
    name: 'Dr. Sarah Williams',
    first_name: 'Sarah',
    last_name: 'Williams',
    alias: ['Dr. Williams', 'Sarah'],
    pronouns: 'she/her',
    archetype: 'mentor',
    role: 'Research Supervisor',
    status: 'active',
    importance_level: 'major',
    importance_score: 74,
    is_nickname: false,
    summary: 'My research supervisor during grad school. Her rigorous standards and supportive guidance shaped my approach to research and critical thinking.',
    tags: ['research', 'academic', 'mentorship', 'guidance'],
    metadata: {
      relationship_type: 'professional',
      closeness_score: 79,
      first_met: '2020-09-15'
    },
    social_media: {
      email: 'sarah.williams@university.edu'
    },
    memory_count: 24,
    relationship_count: 2
  },
  {
    id: 'dummy-21',
    name: 'Jamie Park',
    first_name: 'Jamie',
    last_name: 'Park',
    alias: generateNicknames('Jamie Park', 'A fellow musician I met at an open mic. We\'ve jammed together countless times and they\'ve introduced me to genres I never would have explored.', 'Music Partner', ['music', 'creativity', 'friendship', 'collaboration']),
    pronouns: 'they/them',
    archetype: 'friend',
    role: 'Music Partner',
    status: 'active',
    importance_level: 'minor',
    importance_score: 41,
    is_nickname: false,
    summary: 'A fellow musician I met at an open mic. We\'ve jammed together countless times and they\'ve introduced me to genres I never would have explored.',
    tags: ['music', 'creativity', 'friendship', 'collaboration'],
    metadata: {
      relationship_type: 'friend',
      closeness_score: 71,
      first_met: '2021-07-22'
    },
    social_media: {
      instagram: '@jamie_music',
      spotify: 'jamiepark'
    },
    memory_count: 17,
    relationship_count: 4
  },
  {
    id: 'dummy-22',
    name: 'Ethan Walker',
    first_name: 'Ethan',
    last_name: 'Walker',
    alias: generateNicknames('Ethan Walker', 'My hiking partner and outdoor enthusiast. We\'ve conquered many trails together and he\'s taught me to appreciate the wilderness.', 'Hiking Partner', ['hiking', 'outdoors', 'adventure', 'friendship']),
    pronouns: 'he/him',
    archetype: 'friend',
    role: 'Hiking Partner',
    status: 'active',
    importance_level: 'minor',
    importance_score: 39,
    is_nickname: false,
    summary: 'My hiking partner and outdoor enthusiast. We\'ve conquered many trails together and he\'s taught me to appreciate the wilderness.',
    tags: ['hiking', 'outdoors', 'adventure', 'friendship'],
    metadata: {
      relationship_type: 'friend',
      closeness_score: 74,
      first_met: '2021-09-18'
    },
    social_media: {
      instagram: '@ethan_hikes'
    },
    memory_count: 19,
    relationship_count: 2
  },
  {
    id: 'dummy-23',
    name: 'Riley Chen',
    first_name: 'Riley',
    last_name: 'Chen',
    alias: generateNicknames('Riley Chen', 'A friend I met in a philosophy class. We have the most engaging late-night conversations about existence, ethics, and the meaning of life.', 'Philosophy Buddy', ['philosophy', 'discussion', 'friendship', 'intellectual']),
    pronouns: 'they/them',
    archetype: 'friend',
    role: 'Philosophy Buddy',
    status: 'active',
    importance_level: 'minor',
    importance_score: 33,
    is_nickname: false,
    summary: 'A friend I met in a philosophy class. We have the most engaging late-night conversations about existence, ethics, and the meaning of life.',
    tags: ['philosophy', 'discussion', 'friendship', 'intellectual'],
    metadata: {
      relationship_type: 'friend',
      closeness_score: 74,
      first_met: '2021-09-05'
    },
    social_media: {
      email: 'riley.thoughts@example.com'
    },
    memory_count: 13,
    relationship_count: 1
  },
  {
    id: 'dummy-24',
    name: 'Ava Foster',
    first_name: 'Ava',
    last_name: 'Foster',
    alias: generateNicknames('Ava Foster', 'A fellow artist at the shared studio. Her bold style and fearless experimentation inspire me to push my creative boundaries.', 'Studio Artist', ['art', 'creativity', 'inspiration', 'collaboration']),
    pronouns: 'she/her',
    archetype: 'collaborator',
    role: 'Studio Artist',
    status: 'active',
    importance_level: 'background',
    importance_score: 28,
    is_nickname: false,
    summary: 'A fellow artist at the shared studio. Her bold style and fearless experimentation inspire me to push my creative boundaries.',
    tags: ['art', 'creativity', 'inspiration', 'collaboration'],
    metadata: {
      relationship_type: 'professional',
      closeness_score: 69,
      first_met: '2022-03-22'
    },
    social_media: {
      instagram: '@ava_creates',
      website: 'avafoster.art'
    },
    memory_count: 11,
    relationship_count: 1
  },
  {
    id: 'dummy-25',
    name: 'Dr. Michael Chen',
    first_name: 'Michael',
    last_name: 'Chen',
    alias: ['Dr. Chen', 'Michael'],
    pronouns: 'he/him',
    archetype: 'mentor',
    role: 'Career Advisor',
    status: 'active',
    importance_level: 'supporting',
    importance_score: 52,
    is_nickname: false,
    summary: 'A career advisor who helped me navigate job transitions and negotiate offers. His practical advice and industry insights have been invaluable.',
    tags: ['career', 'advice', 'professional', 'guidance'],
    metadata: {
      relationship_type: 'professional',
      closeness_score: 76,
      first_met: '2022-03-20'
    },
    social_media: {
      linkedin: 'michael-chen-career',
      email: 'michael@careeradvice.com'
    },
    memory_count: 12,
    relationship_count: 1
  },
  {
    id: 'dummy-26',
    name: 'Lucas Wright',
    first_name: 'Lucas',
    last_name: 'Wright',
    alias: generateNicknames('Lucas Wright', 'A beach volleyball partner I met during summer. His positive energy and love for the ocean are contagious.', 'Beach Volleyball Partner', ['sports', 'beach', 'friendship', 'fun']),
    pronouns: 'he/him',
    archetype: 'friend',
    role: 'Beach Volleyball Partner',
    status: 'active',
    importance_level: 'background',
    importance_score: 22,
    is_nickname: false,
    summary: 'A beach volleyball partner I met during summer. His positive energy and love for the ocean are contagious.',
    tags: ['sports', 'beach', 'friendship', 'fun'],
    metadata: {
      relationship_type: 'friend',
      closeness_score: 66,
      first_met: '2022-07-05'
    },
    social_media: {
      instagram: '@lucas_beach'
    },
    memory_count: 9,
    relationship_count: 1
  },
  {
    id: 'dummy-27',
    name: 'Casey Morgan',
    first_name: 'Casey',
    last_name: 'Morgan',
    alias: generateNicknames('Casey Morgan', 'My gaming partner and friend. We\'ve spent countless hours playing together and their strategic thinking always impresses me.', 'Gaming Buddy', ['gaming', 'friendship', 'strategy', 'fun']),
    pronouns: 'they/them',
    archetype: 'friend',
    role: 'Gaming Buddy',
    status: 'active',
    importance_level: 'background',
    importance_score: 26,
    is_nickname: false,
    summary: 'My gaming partner and friend. We\'ve spent countless hours playing together and their strategic thinking always impresses me.',
    tags: ['gaming', 'friendship', 'strategy', 'fun'],
    metadata: {
      relationship_type: 'friend',
      closeness_score: 69,
      first_met: '2022-06-12'
    },
    social_media: {
      discord: 'casey_games#1234'
    },
    memory_count: 10,
    relationship_count: 2
  },
  {
    id: 'dummy-28',
    name: 'Grace Lee',
    first_name: 'Grace',
    last_name: 'Lee',
    alias: generateNicknames('Grace Lee', 'A fellow yoga practitioner who has become a close friend. Her dedication to the practice and gentle wisdom inspire me daily.', 'Yoga Friend', ['yoga', 'wellness', 'friendship', 'mindfulness']),
    pronouns: 'she/her',
    archetype: 'friend',
    role: 'Yoga Friend',
    status: 'active',
    importance_level: 'minor',
    importance_score: 44,
    is_nickname: false,
    summary: 'A fellow yoga practitioner who has become a close friend. Her dedication to the practice and gentle wisdom inspire me daily.',
    tags: ['yoga', 'wellness', 'friendship', 'mindfulness'],
    metadata: {
      relationship_type: 'friend',
      closeness_score: 72,
      first_met: '2022-01-28'
    },
    social_media: {
      email: 'grace.lee@example.com'
    },
    memory_count: 17,
    relationship_count: 2
  },
  {
    id: 'dummy-29',
    name: 'Taylor Kim',
    alias: generateNicknames('Taylor Kim', 'A friend I met while traveling. We\'ve explored several countries together and she\'s taught me to be more adventurous and open to new experiences.', 'Travel Companion', ['travel', 'adventure', 'friendship', 'exploration']),
    pronouns: 'she/her',
    archetype: 'friend',
    role: 'Travel Companion',
    status: 'active',
    summary: 'A friend I met while traveling. We\'ve explored several countries together and she\'s taught me to be more adventurous and open to new experiences.',
    tags: ['travel', 'adventure', 'friendship', 'exploration'],
    metadata: {
      relationship_type: 'friend',
      closeness_score: 78,
      first_met: '2021-05-18'
    },
    social_media: {
      instagram: '@taylor_travels'
    },
    memory_count: 23,
    relationship_count: 5
  },
  {
    id: 'dummy-30',
    name: 'Harper Davis',
    alias: generateNicknames('Harper Davis', 'A vendor at the farmer\'s market who always has the best produce and stories. We\'ve become friends over our weekly conversations about food and community.', 'Market Vendor', ['food', 'community', 'local', 'friendship']),
    pronouns: 'they/them',
    archetype: 'friend',
    role: 'Market Vendor',
    status: 'active',
    summary: 'A vendor at the farmer\'s market who always has the best produce and stories. We\'ve become friends over our weekly conversations about food and community.',
    tags: ['food', 'community', 'local', 'friendship'],
    metadata: {
      relationship_type: 'friend',
      closeness_score: 65,
      first_met: '2021-10-12'
    },
    social_media: {
      email: 'harper@localmarket.com'
    },
    memory_count: 10,
    relationship_count: 1
  },
  // Unmet characters - mentioned but not met
  {
    id: 'unmet-1',
    name: 'Dr. Elena Vasquez',
    alias: generateNicknames('Dr. Elena Vasquez', 'A renowned psychologist I\'ve been reading about. Her work on trauma recovery is fascinating and I\'d love to attend one of her workshops someday.', 'Future Mentor', ['psychology', 'trauma-recovery', 'inspiration']),
    pronouns: 'she/her',
    archetype: 'mentor',
    role: 'Future Mentor',
    status: 'unmet',
    summary: 'A renowned psychologist I\'ve been reading about. Her work on trauma recovery is fascinating and I\'d love to attend one of her workshops someday.',
    tags: ['psychology', 'trauma-recovery', 'inspiration', 'future'],
    metadata: {
      relationship_type: 'professional',
      closeness_score: 0,
      mentioned_in: ['chat', 'entries'],
      first_mentioned: '2024-11-15'
    },
    social_media: {
      website: 'elenavasquez.com',
      twitter: '@dr_vasquez'
    },
    memory_count: 3,
    relationship_count: 0
  },
  {
    id: 'unmet-2',
    name: 'Alex Morgan',
    alias: generateNicknames('Alex Morgan', 'A friend of a friend who sounds really interesting. Sarah keeps telling me I should meet them - they\'re into the same hobbies and seem like someone I\'d get along with.', 'Future Friend', ['mutual-friend', 'shared-interests', 'recommended']),
    pronouns: 'they/them',
    archetype: 'friend',
    role: 'Future Friend',
    status: 'unmet',
    summary: 'A friend of a friend who sounds really interesting. Sarah keeps telling me I should meet them - they\'re into the same hobbies and seem like someone I\'d get along with.',
    tags: ['mutual-friend', 'shared-interests', 'recommended', 'future'],
    metadata: {
      relationship_type: 'friend',
      closeness_score: 0,
      mentioned_in: ['chat'],
      first_mentioned: '2024-11-20',
      mutual_connection: 'Sarah Chen'
    },
    memory_count: 2,
    relationship_count: 0
  },
  {
    id: 'unmet-3',
    name: 'The Wanderer',
    alias: ['Wanderer', 'The Traveler', 'Nomad'],
    pronouns: 'they/them',
    archetype: 'friend',
    role: 'Paracosm Character',
    status: 'unmet',
    summary: 'A character from my imagined world - a mysterious traveler who appears in my creative writing. They represent freedom and adventure.',
    tags: ['paracosm', 'creative', 'imagined', 'story'],
    metadata: {
      relationship_type: 'imagined',
      closeness_score: 0,
      mentioned_in: ['entries', 'creative-work'],
      first_mentioned: '2024-09-10',
      source: 'paracosm'
    },
    memory_count: 8,
    relationship_count: 0
  },
  {
    id: 'unmet-4',
    name: 'Professor James Chen',
    alias: generateNicknames('Professor James Chen', 'A professor at the university I want to transfer to. His research on cognitive science aligns perfectly with my interests. I\'ve been following his papers.', 'Future Academic Advisor', ['academic', 'research', 'future', 'inspiration']),
    pronouns: 'he/him',
    archetype: 'mentor',
    role: 'Future Academic Advisor',
    status: 'unmet',
    summary: 'A professor at the university I want to transfer to. His research on cognitive science aligns perfectly with my interests. I\'ve been following his papers.',
    tags: ['academic', 'research', 'future', 'inspiration'],
    metadata: {
      relationship_type: 'professional',
      closeness_score: 0,
      mentioned_in: ['entries', 'research'],
      first_mentioned: '2024-10-05'
    },
    social_media: {
      website: 'jameschen.research.edu',
      linkedin: 'james-chen-phd'
    },
    memory_count: 5,
    relationship_count: 0
  },
  {
    id: 'unmet-5',
    name: 'Maya Starling',
    alias: generateNicknames('Maya Starling', 'An artist whose work I discovered online. Her paintings capture emotions in a way that resonates deeply with me. I\'d love to collaborate with her someday.', 'Future Collaborator', ['art', 'collaboration', 'inspiration', 'future']),
    pronouns: 'she/her',
    archetype: 'collaborator',
    role: 'Future Collaborator',
    status: 'unmet',
    summary: 'An artist whose work I discovered online. Her paintings capture emotions in a way that resonates deeply with me. I\'d love to collaborate with her someday.',
    tags: ['art', 'collaboration', 'inspiration', 'future'],
    metadata: {
      relationship_type: 'professional',
      closeness_score: 0,
      mentioned_in: ['entries', 'research'],
      first_mentioned: '2024-11-01'
    },
    social_media: {
      instagram: '@maya_starling_art',
      website: 'mayastarling.art'
    },
    memory_count: 4,
    relationship_count: 0
  },
  // Additional diverse characters to showcase app capabilities
  
  // === FAMILY MEMBERS ===
  {
    id: 'family-1',
    name: 'Robert Chen',
    alias: ['Dad', 'Robert', 'Rob'],
    pronouns: 'he/him',
    archetype: 'family',
    role: 'Father',
    status: 'active',
    summary: 'My father. We have a complex relationship that has evolved over the years. He taught me the value of hard work and perseverance.',
    tags: ['family', 'father', 'mentor', 'support'],
    metadata: {
      relationship_type: 'family',
      closeness_score: 75,
      first_met: '1990-01-01'
    },
    social_media: {
      email: 'robert.chen@example.com',
      phone: '+1-555-0101'
    },
    memory_count: 45,
    relationship_count: 15
  },
  {
    id: 'family-2',
    name: 'Linda Chen',
    alias: ['Mom', 'Linda'],
    pronouns: 'she/her',
    archetype: 'family',
    role: 'Mother',
    status: 'active',
    summary: 'My mother. Her unconditional love and wisdom have shaped who I am today. She always knows how to make me feel better.',
    tags: ['family', 'mother', 'love', 'support', 'wisdom'],
    metadata: {
      relationship_type: 'family',
      closeness_score: 92,
      first_met: '1990-01-01'
    },
    social_media: {
      email: 'linda.chen@example.com',
      phone: '+1-555-0102'
    },
    memory_count: 58,
    relationship_count: 20
  },
  
  // === FRIENDS (Diverse) ===
  {
    id: 'friend-1',
    name: 'Chris Park',
    alias: ['Chris', 'CP'],
    pronouns: 'he/him',
    archetype: 'friend',
    role: 'Childhood Friend',
    status: 'active',
    summary: 'We\'ve been friends since elementary school. Even though we live in different cities now, we still talk regularly and pick up right where we left off.',
    tags: ['friendship', 'childhood', 'long-term', 'loyalty'],
    metadata: {
      relationship_type: 'friend',
      closeness_score: 88,
      first_met: '2000-09-01'
    },
    social_media: {
      instagram: '@chris_park',
      email: 'chris.park@example.com'
    },
    memory_count: 42,
    relationship_count: 18
  },
  {
    id: 'friend-2',
    name: 'Morgan Lee',
    alias: generateNicknames('Morgan Lee', 'A friend I met at a coding bootcamp. We bonded over our shared struggles and now we\'re both working in tech. They\'re always up for a late-night coding session.', 'Coding Buddy', ['coding', 'tech', 'friendship', 'learning']),
    pronouns: 'they/them',
    archetype: 'friend',
    role: 'Coding Buddy',
    status: 'active',
    summary: 'A friend I met at a coding bootcamp. We bonded over our shared struggles and now we\'re both working in tech. They\'re always up for a late-night coding session.',
    tags: ['coding', 'tech', 'friendship', 'learning'],
    metadata: {
      relationship_type: 'friend',
      closeness_score: 76,
      first_met: '2022-03-15'
    },
    social_media: {
      github: 'morgan-lee-dev',
      linkedin: 'morgan-lee-tech'
    },
    memory_count: 28,
    relationship_count: 5
  },
  {
    id: 'friend-3',
    name: 'Quinn Anderson',
    alias: ['Quinn', 'Q'],
    pronouns: 'they/them',
    archetype: 'ally',
    role: 'Support System',
    status: 'active',
    summary: 'One of my most supportive friends. They always know what to say and when to just listen. I can be completely myself around them.',
    tags: ['support', 'friendship', 'trust', 'authenticity'],
    metadata: {
      relationship_type: 'friend',
      closeness_score: 91,
      first_met: '2019-05-20'
    },
    social_media: {
      email: 'quinn.anderson@example.com'
    },
    memory_count: 35,
    relationship_count: 12
  },
  {
    id: 'friend-4',
    name: 'Dakota Singh',
    alias: generateNicknames('Dakota Singh', 'A friend from my meditation retreat. Their calm presence and deep insights have been incredibly valuable.', 'Meditation Friend', ['meditation', 'mindfulness', 'friendship', 'peace']),
    pronouns: 'they/them',
    archetype: 'friend',
    role: 'Meditation Friend',
    status: 'active',
    summary: 'A friend from my meditation retreat. Their calm presence and deep insights have been incredibly valuable.',
    tags: ['meditation', 'mindfulness', 'friendship', 'peace'],
    metadata: {
      relationship_type: 'friend',
      closeness_score: 73,
      first_met: '2021-08-10'
    },
    memory_count: 15,
    relationship_count: 3
  },
  
  // === MENTORS (Diverse) ===
  {
    id: 'mentor-1',
    name: 'Dr. Patricia Wong',
    alias: ['Dr. Wong', 'Patricia', 'Pat'],
    pronouns: 'she/her',
    archetype: 'mentor',
    role: 'Career Mentor',
    status: 'active',
    summary: 'A senior executive who took me under her wing. Her career advice and industry connections have been invaluable. She pushes me to aim higher.',
    tags: ['career', 'mentorship', 'leadership', 'professional'],
    metadata: {
      relationship_type: 'professional',
      closeness_score: 84,
      first_met: '2020-06-01'
    },
    social_media: {
      linkedin: 'patricia-wong-exec',
      email: 'patricia.wong@example.com'
    },
    memory_count: 31,
    relationship_count: 8
  },
  {
    id: 'mentor-2',
    name: 'Master Chen Wei',
    alias: ['Master Chen', 'Sifu'],
    pronouns: 'he/him',
    archetype: 'mentor',
    role: 'Martial Arts Instructor',
    status: 'active',
    summary: 'My martial arts instructor for the past 5 years. He teaches me discipline, focus, and inner strength. His philosophy extends beyond the dojo.',
    tags: ['martial-arts', 'discipline', 'philosophy', 'mentorship'],
    metadata: {
      relationship_type: 'coach',
      closeness_score: 79,
      first_met: '2019-01-10'
    },
    social_media: {
      website: 'chenweimartialarts.com'
    },
    memory_count: 38,
    relationship_count: 2
  },
  {
    id: 'mentor-3',
    name: 'Dr. Rachel Kim',
    alias: ['Dr. Kim', 'Rachel'],
    pronouns: 'she/her',
    archetype: 'mentor',
    role: 'Academic Advisor',
    status: 'active',
    summary: 'My PhD advisor. She\'s brilliant, demanding, and incredibly supportive. Her research guidance has shaped my academic journey.',
    tags: ['academic', 'research', 'mentorship', 'education'],
    metadata: {
      relationship_type: 'professional',
      closeness_score: 86,
      first_met: '2021-09-01'
    },
    social_media: {
      email: 'rachel.kim@university.edu',
      website: 'rachelkim.research.edu'
    },
    memory_count: 52,
    relationship_count: 6
  },
  
  // === PROFESSIONAL NETWORK ===
  {
    id: 'professional-1',
    name: 'Jessica Martinez',
    alias: ['Jess', 'Jessica'],
    pronouns: 'she/her',
    archetype: 'colleague',
    role: 'Team Lead',
    status: 'active',
    summary: 'My team lead at work. She\'s a great manager who balances high expectations with genuine care for her team. I\'ve learned a lot from her leadership style.',
    tags: ['work', 'leadership', 'professional', 'management'],
    metadata: {
      relationship_type: 'professional',
      closeness_score: 68,
      first_met: '2021-02-15'
    },
    social_media: {
      linkedin: 'jessica-martinez-lead',
      email: 'jessica.martinez@company.com'
    },
    memory_count: 24,
    relationship_count: 4
  },
  {
    id: 'professional-2',
    name: 'Ryan O\'Connor',
    alias: ['Ryan', 'RO'],
    pronouns: 'he/him',
    archetype: 'colleague',
    role: 'Senior Developer',
    status: 'active',
    summary: 'A senior developer on my team. He\'s always willing to help debug issues and share knowledge. His code reviews are thorough and educational.',
    tags: ['coding', 'work', 'professional', 'mentorship'],
    metadata: {
      relationship_type: 'professional',
      closeness_score: 71,
      first_met: '2021-03-01'
    },
    social_media: {
      github: 'ryan-oconnor-dev',
      linkedin: 'ryan-oconnor'
    },
    memory_count: 19,
    relationship_count: 3
  },
  {
    id: 'professional-3',
    name: 'Amara Patel',
    alias: ['Amara'],
    pronouns: 'she/her',
    archetype: 'colleague',
    role: 'Product Manager',
    status: 'active',
    summary: 'A product manager I work closely with. Her strategic thinking and user-focused approach inspire me. We collaborate well on cross-functional projects.',
    tags: ['product', 'strategy', 'professional', 'collaboration'],
    metadata: {
      relationship_type: 'professional',
      closeness_score: 65,
      first_met: '2022-01-10'
    },
    social_media: {
      linkedin: 'amara-patel-pm',
      twitter: '@amara_product'
    },
    memory_count: 16,
    relationship_count: 2
  },
  
  // === CREATIVE CIRCLE ===
  {
    id: 'creative-1',
    name: 'Phoenix Black',
    alias: ['Phoenix', 'Nix'],
    pronouns: 'they/them',
    archetype: 'collaborator',
    role: 'Music Producer',
    status: 'active',
    summary: 'A talented music producer I collaborate with. Their production skills are incredible and they always bring fresh ideas to our projects.',
    tags: ['music', 'production', 'creativity', 'collaboration'],
    metadata: {
      relationship_type: 'professional',
      closeness_score: 74,
      first_met: '2021-11-05'
    },
    social_media: {
      instagram: '@phoenix_black_music',
      spotify: 'phoenixblack',
      website: 'phoenixblackmusic.com'
    },
    memory_count: 22,
    relationship_count: 7
  },
  {
    id: 'creative-2',
    name: 'Sage Thompson',
    alias: generateNicknames('Sage Thompson', 'A writer I met at a workshop. We exchange manuscripts and provide feedback. Their writing style is poetic and powerful.', 'Writing Partner', ['writing', 'literature', 'creativity', 'feedback']),
    pronouns: 'they/them',
    archetype: 'collaborator',
    role: 'Writing Partner',
    status: 'active',
    summary: 'A writer I met at a workshop. We exchange manuscripts and provide feedback. Their writing style is poetic and powerful.',
    tags: ['writing', 'literature', 'creativity', 'feedback'],
    metadata: {
      relationship_type: 'professional',
      closeness_score: 77,
      first_met: '2022-04-20'
    },
    social_media: {
      twitter: '@sage_writes',
      website: 'sagethompson.com'
    },
    memory_count: 18,
    relationship_count: 4
  },
  {
    id: 'creative-3',
    name: 'Indigo Moon',
    alias: ['Indigo', 'Indy'],
    pronouns: 'she/her',
    archetype: 'collaborator',
    role: 'Visual Artist',
    status: 'active',
    summary: 'A visual artist whose work I admire. We\'ve collaborated on a few projects combining her illustrations with my writing. Her aesthetic is stunning.',
    tags: ['art', 'illustration', 'creativity', 'collaboration'],
    metadata: {
      relationship_type: 'professional',
      closeness_score: 70,
      first_met: '2021-12-15'
    },
    social_media: {
      instagram: '@indigo_moon_art',
      website: 'indigomoon.art'
    },
    memory_count: 14,
    relationship_count: 3
  },
  
  // === MORE UNMET CHARACTERS ===
  {
    id: 'unmet-6',
    name: 'Dr. Aria Chen',
    alias: ['Dr. Chen', 'Aria'],
    pronouns: 'she/her',
    archetype: 'mentor',
    role: 'Future Research Collaborator',
    status: 'unmet',
    summary: 'A researcher whose papers I\'ve been following. Her work on neural interfaces is groundbreaking. I\'d love to collaborate with her someday.',
    tags: ['research', 'neuroscience', 'future', 'inspiration'],
    metadata: {
      relationship_type: 'professional',
      closeness_score: 0,
      mentioned_in: ['entries', 'research'],
      first_mentioned: '2024-10-20'
    },
    social_media: {
      website: 'ariachen.research.edu',
      linkedin: 'aria-chen-phd'
    },
    memory_count: 6,
    relationship_count: 0
  },
  {
    id: 'unmet-7',
    name: 'Kai Storm',
    alias: ['Kai', 'Storm'],
    pronouns: 'they/them',
    archetype: 'friend',
    role: 'Future Adventure Partner',
    status: 'unmet',
    summary: 'Someone I met online in a hiking group. We\'ve been planning a backpacking trip together. They seem adventurous and fun.',
    tags: ['adventure', 'hiking', 'future', 'online-friend'],
    metadata: {
      relationship_type: 'friend',
      closeness_score: 0,
      mentioned_in: ['chat'],
      first_mentioned: '2024-11-10'
    },
    social_media: {
      instagram: '@kai_storm_adventures'
    },
    memory_count: 2,
    relationship_count: 0
  },
  {
    id: 'unmet-8',
    name: 'The Oracle',
    alias: ['Oracle', 'The Guide'],
    pronouns: 'it/its',
    archetype: 'mentor',
    role: 'Paracosm Guide',
    status: 'unmet',
    summary: 'A wise entity from my imagined world who appears in my dreams and creative writing. Represents inner wisdom and guidance.',
    tags: ['paracosm', 'imagined', 'wisdom', 'creative'],
    metadata: {
      relationship_type: 'imagined',
      closeness_score: 0,
      mentioned_in: ['entries', 'creative-work', 'dreams'],
      first_mentioned: '2023-05-15',
      source: 'paracosm'
    },
    memory_count: 12,
    relationship_count: 0
  },
  
  // === EDGE CASES: Characters with minimal data ===
  {
    id: 'minimal-1',
    name: 'Alex Unknown',
    alias: [],
    pronouns: 'they/them',
    archetype: 'friend',
    role: 'Acquaintance',
    status: 'active',
    summary: 'Someone I met briefly at an event. We exchanged contact info but haven\'t connected much yet.',
    tags: ['acquaintance'],
    metadata: {
      relationship_type: 'friend',
      closeness_score: 25,
      first_met: '2024-09-15'
    },
    memory_count: 1,
    relationship_count: 0
  },
  {
    id: 'minimal-2',
    name: 'Dr. Smith',
    alias: ['Dr. Smith'],
    pronouns: 'he/him',
    archetype: 'mentor',
    role: 'Former Professor',
    status: 'inactive',
    summary: 'A professor from my undergraduate years. We haven\'t been in touch since graduation.',
    tags: ['academic', 'past'],
    metadata: {
      relationship_type: 'professional',
      closeness_score: 45,
      first_met: '2018-09-01'
    },
    memory_count: 8,
    relationship_count: 1
  },
  
  // === HIGH MEMORY COUNT CHARACTERS ===
  {
    id: 'high-memory-1',
    name: 'Samantha "Sam" Rodriguez',
    first_name: 'Samantha',
    last_name: 'Rodriguez',
    alias: ['Sam', 'Samantha', 'Sammy', 'S-Rod'],
    pronouns: 'she/her',
    archetype: 'ally',
    role: 'Best Friend',
    status: 'active',
    importance_level: 'protagonist',
    importance_score: 98,
    is_nickname: false,
    summary: 'My best friend since high school. We\'ve been through everything together - breakups, career changes, family drama, celebrations. She knows me better than anyone.',
    tags: ['friendship', 'best-friend', 'support', 'loyalty', 'history', 'trust'],
    metadata: {
      relationship_type: 'friend',
      closeness_score: 98,
      first_met: '2012-09-01'
    },
    social_media: {
      instagram: '@sam_rodriguez',
      twitter: '@sam_ro',
      facebook: 'samantha.rodriguez',
      email: 'sam.rodriguez@example.com',
      phone: '+1-555-0201'
    },
    memory_count: 127,
    relationship_count: 45
  },
  
  // === CHARACTERS WITH MANY TAGS ===
  {
    id: 'many-tags-1',
    name: 'Dr. Marcus "Marc" Thompson',
    first_name: 'Marcus',
    last_name: 'Thompson',
    alias: generateNicknames('Dr. Marcus Thompson', 'A renaissance person - doctor, musician, writer, and mentor. He\'s been a huge influence in multiple areas of my life.', 'Renaissance Mentor', ['medicine', 'music', 'writing', 'mentorship', 'multi-talented', 'inspiration', 'guidance', 'creativity']),
    pronouns: 'he/him',
    archetype: 'mentor',
    role: 'Multi-Faceted Mentor',
    status: 'active',
    importance_level: 'major',
    importance_score: 91,
    is_nickname: false,
    summary: 'A renaissance person - doctor, musician, writer, and mentor. He\'s been a huge influence in multiple areas of my life.',
    tags: ['medicine', 'music', 'writing', 'mentorship', 'multi-talented', 'inspiration', 'guidance', 'creativity', 'wisdom'],
    metadata: {
      relationship_type: 'coach',
      closeness_score: 87,
      first_met: '2019-06-10'
    },
    social_media: {
      website: 'marcusthompson.com',
      linkedin: 'marcus-thompson-md',
      instagram: '@marcus_thompson_md',
      twitter: '@dr_marcus_t'
    },
    memory_count: 67,
    relationship_count: 15
  },
  
  // === CHARACTERS WITH NO SOCIAL MEDIA ===
  {
    id: 'no-social-1',
    name: 'Grandma Li',
    first_name: null,
    last_name: 'Li',
    alias: ['Grandma', 'Nai Nai'],
    pronouns: 'she/her',
    archetype: 'family',
    role: 'Grandmother',
    status: 'active',
    importance_level: 'protagonist',
    importance_score: 96,
    is_nickname: false,
    summary: 'My grandmother. She doesn\'t use social media, but we talk on the phone weekly. Her stories and wisdom are priceless.',
    tags: ['family', 'grandmother', 'wisdom', 'tradition'],
    metadata: {
      relationship_type: 'family',
      closeness_score: 89,
      first_met: '1990-01-01'
    },
    social_media: {},
    memory_count: 41,
    relationship_count: 8
  },
  
  // === CHARACTERS WITH NICKNAMES (AUTO-GENERATED) ===
  {
    id: 'nickname-1',
    name: 'The Coffee Shop Friend',
    first_name: null,
    last_name: null,
    alias: ['Coffee Friend', 'Barista Friend'],
    pronouns: 'they/them',
    archetype: 'friend',
    role: 'Coffee Shop Regular',
    status: 'active',
    importance_level: 'minor',
    importance_score: 31,
    is_nickname: true,
    proximity_level: 'distant',
    has_met: true,
    relationship_depth: 'acquaintance',
    likelihood_to_meet: 'likely',
    summary: 'A friendly person I see regularly at my favorite coffee shop. We always have brief but pleasant conversations. I don\'t know their real name yet.',
    tags: ['coffee', 'casual-friend', 'regular', 'auto-generated'],
    metadata: {
      relationship_type: 'acquaintance',
      closeness_score: 45,
      first_met: '2023-01-15',
      autoGenerated: true,
      fromNickname: true
    },
    social_media: {},
    memory_count: 8,
    relationship_count: 0
  },
  {
    id: 'nickname-2',
    name: 'The Midnight Philosopher',
    first_name: null,
    last_name: null,
    alias: ['Philosophy Friend', 'Late Night Thinker'],
    pronouns: 'he/him',
    archetype: 'friend',
    role: 'Philosophy Discussion Partner',
    status: 'active',
    importance_level: 'supporting',
    importance_score: 54,
    is_nickname: true,
    proximity_level: 'distant',
    has_met: false,
    relationship_depth: 'casual',
    likelihood_to_meet: 'unlikely',
    summary: 'Someone I met online who shares my love for deep philosophical discussions. We have late-night conversations about existence, meaning, and consciousness. Real name unknown.',
    tags: ['philosophy', 'online-friend', 'deep-conversations', 'auto-generated'],
    metadata: {
      relationship_type: 'friend',
      closeness_score: 72,
      first_met: '2022-11-20',
      autoGenerated: true,
      fromNickname: true
    },
    social_media: {},
    memory_count: 15,
    relationship_count: 1
  },
  {
    id: 'nickname-3',
    name: 'The Gym Buddy',
    first_name: null,
    last_name: null,
    alias: ['Workout Partner', 'Fitness Friend'],
    pronouns: 'they/them',
    archetype: 'friend',
    role: 'Gym Partner',
    status: 'active',
    importance_level: 'minor',
    importance_score: 36,
    is_nickname: true,
    proximity_level: 'distant',
    has_met: true,
    relationship_depth: 'casual',
    likelihood_to_meet: 'likely',
    summary: 'A person I work out with regularly at the gym. We motivate each other and spot each other during workouts. Haven\'t learned their real name yet.',
    tags: ['fitness', 'gym', 'workout', 'auto-generated'],
    metadata: {
      relationship_type: 'friend',
      closeness_score: 58,
      first_met: '2023-03-10',
      autoGenerated: true,
      fromNickname: true
    },
    social_media: {},
    memory_count: 11,
    relationship_count: 0
  },
  
  // === THIRD PARTY / INDIRECT CHARACTERS ===
  {
    id: 'third-party-1',
    name: 'Sarah\'s Ex-Boyfriend',
    first_name: null,
    last_name: null,
    alias: ['Sarah\'s Ex', 'The Ex'],
    pronouns: 'he/him',
    archetype: 'friend',
    role: 'Friend\'s Ex',
    status: 'active',
    importance_level: 'background',
    importance_score: 15,
    is_nickname: true,
    proximity_level: 'third_party',
    has_met: false,
    relationship_depth: 'mentioned_only',
    likelihood_to_meet: 'never',
    context_of_mention: 'Mentioned by Sarah when talking about her past relationships',
    associated_with_character_ids: ['dummy-1'], // Associated with Sarah Chen
    summary: 'Sarah\'s ex-boyfriend that she mentioned in conversation. I\'ve never met him and probably never will. Just mentioned in passing.',
    tags: ['third-party', 'mentioned-only', 'auto-generated'],
    metadata: {
      relationship_type: 'third_party',
      closeness_score: 0,
      autoGenerated: true,
      fromNickname: true
    },
    social_media: {},
    memory_count: 2,
    relationship_count: 0
  },
  {
    id: 'third-party-2',
    name: 'Marcus\'s Wife',
    first_name: null,
    last_name: null,
    alias: ['Marcus\'s Spouse', 'The Wife'],
    pronouns: 'she/her',
    archetype: 'family',
    role: 'Mentor\'s Spouse',
    status: 'active',
    importance_level: 'background',
    importance_score: 12,
    is_nickname: true,
    proximity_level: 'indirect',
    has_met: false,
    relationship_depth: 'mentioned_only',
    likelihood_to_meet: 'possible',
    context_of_mention: 'Mentioned by Marcus when talking about his family life',
    associated_with_character_ids: ['dummy-2'], // Associated with Marcus Johnson
    summary: 'Marcus\'s wife. He\'s mentioned her a few times but I\'ve never met her. Might meet her at some point if I visit Marcus.',
    tags: ['indirect', 'mentioned-only', 'auto-generated'],
    metadata: {
      relationship_type: 'indirect',
      closeness_score: 5,
      autoGenerated: true,
      fromNickname: true
    },
    social_media: {},
    memory_count: 3,
    relationship_count: 1
  },
  {
    id: 'distant-1',
    name: 'The Neighbor Downstairs',
    first_name: null,
    last_name: null,
    alias: ['Downstairs Neighbor', 'The Neighbor'],
    pronouns: 'they/them',
    archetype: 'friend',
    role: 'Neighbor',
    status: 'active',
    importance_level: 'background',
    importance_score: 8,
    is_nickname: true,
    proximity_level: 'distant',
    has_met: true,
    relationship_depth: 'acquaintance',
    likelihood_to_meet: 'likely',
    summary: 'My neighbor who lives downstairs. We\'ve exchanged brief greetings in the hallway but I don\'t really know them. Just a casual acquaintance.',
    tags: ['neighbor', 'acquaintance', 'auto-generated'],
    metadata: {
      relationship_type: 'acquaintance',
      closeness_score: 20,
      autoGenerated: true,
      fromNickname: true
    },
    social_media: {},
    memory_count: 4,
    relationship_count: 0
  },
  
  // === INACTIVE CHARACTERS ===
  {
    id: 'inactive-1',
    name: 'Tom Wilson',
    first_name: 'Tom',
    last_name: 'Wilson',
    alias: ['Tom', 'Tommy'],
    pronouns: 'he/him',
    archetype: 'friend',
    role: 'Former Roommate',
    status: 'inactive',
    importance_level: 'background',
    importance_score: 18,
    is_nickname: false,
    proximity_level: 'direct',
    has_met: true,
    relationship_depth: 'moderate',
    likelihood_to_meet: 'unlikely',
    summary: 'A former roommate from college. We were close then but drifted apart after graduation. Haven\'t talked in years.',
    tags: ['past', 'college', 'roommate'],
    metadata: {
      relationship_type: 'friend',
      closeness_score: 30,
      first_met: '2016-09-01'
    },
    social_media: {
      facebook: 'tom.wilson'
    },
    memory_count: 12,
    relationship_count: 3
  }
];

const ITEMS_PER_PAGE = 18; // 3 columns × 6 rows on mobile, more on larger screens

type CharacterCategory = 'all' | 'family' | 'friends' | 'mentors' | 'professional' | 'creative' | 'mentioned' | 'direct' | 'indirect' | 'distant' | 'unmet' | 'third_party';

type CharacterAttribute = {
  id: string;
  attributeType: string;
  attributeValue: string;
  confidence: number;
  isCurrent: boolean;
  evidence?: string;
};

// Romantic Relationship Type
type RomanticRelationship = {
  id: string;
  person_id: string;
  person_type: 'character' | 'omega_entity';
  person_name?: string;
  relationship_type: string;
  status: string;
  is_current: boolean;
  affection_score: number;
  emotional_intensity: number;
  compatibility_score: number;
  relationship_health: number;
  is_situationship: boolean;
  exclusivity_status?: string;
  strengths: string[];
  weaknesses: string[];
  pros: string[];
  cons: string[];
  red_flags: string[];
  green_flags: string[];
  start_date?: string;
  end_date?: string;
  created_at: string;
  rank_among_all?: number;
  rank_among_active?: number;
};

// Main Character Section Component
const MainCharacterSection = ({ user }: { user: any }) => {
  const [userCharacterId, setUserCharacterId] = useState<string | null>(null);
  const [attributes, setAttributes] = useState<CharacterAttribute[]>([]);
  const [loadingAttributes, setLoadingAttributes] = useState(false);

  // Find user character
  useEffect(() => {
    const findUserCharacter = async () => {
      try {
        const response = await fetchJson<{ characters: Character[] }>('/api/characters/list');
        const userChar = response.characters?.find(
          c => c.metadata?.is_self === true || 
               c.metadata?.is_user === true ||
               c.name.toLowerCase() === 'me' ||
               c.name.toLowerCase() === 'myself' ||
               c.name.toLowerCase() === 'self'
        );
        if (userChar) {
          setUserCharacterId(userChar.id);
        }
      } catch (error) {
        console.error('Failed to find user character:', error);
      }
    };
    void findUserCharacter();
  }, []);

  // Load attributes for user character
  useEffect(() => {
    const loadAttributes = async () => {
      if (!userCharacterId) return;
      setLoadingAttributes(true);
      try {
        const response = await fetchJson<{ attributes: CharacterAttribute[] }>(
          `/api/characters/${userCharacterId}/attributes?currentOnly=true`
        );
        setAttributes(response.attributes || []);
      } catch (error) {
        console.error('Failed to load user attributes:', error);
        setAttributes([]);
      } finally {
        setLoadingAttributes(false);
      }
    };
    void loadAttributes();
  }, [userCharacterId]);

  const getAttributeIcon = (type: string) => {
    switch (type) {
      case 'employment_status':
      case 'occupation':
      case 'workplace':
        return <Briefcase className="h-3 w-3" />;
      case 'financial_status':
        return <DollarSign className="h-3 w-3" />;
      case 'lifestyle_pattern':
        return <Activity className="h-3 w-3" />;
      case 'personality_trait':
        return <Smile className="h-3 w-3" />;
      case 'relationship_status':
        return <HeartIcon className="h-3 w-3" />;
      case 'living_situation':
        return <Home className="h-3 w-3" />;
      default:
        return <Tag className="h-3 w-3" />;
    }
  };

  const getAttributeColor = (type: string) => {
    switch (type) {
      case 'employment_status':
      case 'occupation':
      case 'workplace':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'financial_status':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'lifestyle_pattern':
        return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      case 'personality_trait':
        return 'bg-pink-500/20 text-pink-400 border-pink-500/30';
      case 'relationship_status':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'living_situation':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  return (
    <div className="mb-6 pb-4 border-b border-amber-800/20">
      <div className="flex items-center gap-3 mb-3">
        <Star className="h-5 w-5 text-amber-600/80" />
        <div>
          <p className="text-sm font-semibold text-amber-900/60">
            Main Character: <span className="text-amber-900/80">{user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || 'You'}</span>
          </p>
        </div>
      </div>
      
      {/* Attributes */}
      {loadingAttributes ? (
        <p className="text-xs text-amber-700/50 ml-8">Loading attributes...</p>
      ) : attributes.length > 0 ? (
        <div className="ml-8 flex flex-wrap gap-2">
          {attributes.map((attr) => (
            <Badge
              key={attr.id}
              variant="outline"
              className={`${getAttributeColor(attr.attributeType)} text-xs px-2 py-1 flex items-center gap-1.5`}
              title={`${attr.attributeType}: ${attr.attributeValue} (${Math.round(attr.confidence * 100)}% confidence)`}
            >
              {getAttributeIcon(attr.attributeType)}
              <span className="font-medium">{attr.attributeValue}</span>
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-xs text-amber-700/50 ml-8 italic">No attributes detected yet. Attributes are automatically extracted from your conversations.</p>
      )}
    </div>
  );
};

export const CharacterBook = () => {
  const { user } = useAuth();
  const { useMockData: isMockDataEnabled } = useMockData();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState<CharacterCategory>('all');
  const [relationships, setRelationships] = useState<Map<string, RomanticRelationship>>(new Map());
  
  // Register mock data with service on mount
  useEffect(() => {
    mockDataService.register.characters(dummyCharacters);
  }, []);
  const [loading, setLoading] = useState(false);
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const [selectedMemory, setSelectedMemory] = useState<MemoryCard | null>(null);
  const [allMemories, setAllMemories] = useState<MemoryCard[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const { entries = [], chapters = [], timeline, refreshEntries, refreshTimeline } = useLoreKeeper();
  
  // Get chat messages for character extraction
  const conversationStore = useConversationStore();
  const chatMessages = conversationStore.messages.map(msg => ({
    role: msg.role,
    content: msg.content,
    timestamp: msg.timestamp
  }));

  // Auto-extract characters from chat
  useCharacterExtraction(chatMessages, {
    enabled: true,
    onCharacterCreated: (newCharacter) => {
      // Refresh character list when a new character is created
      void loadCharacters();
    }
  });

  const loadCharacters = async () => {
    setLoading(true);
    
    try {
      const response = await fetchJson<{ characters: Character[] }>('/api/characters/list');
      const characterList = response?.characters || [];
      
      // Use mock data service to determine what to show - pass current toggle state
      const result = mockDataService.getWithFallback.characters(
        characterList.length > 0 ? characterList : null,
        isMockDataEnabled
      );
      
      setCharacters(result.data);
    } catch {
      // On error, use mock data if enabled, otherwise empty array
      const result = mockDataService.getWithFallback.characters(null, isMockDataEnabled);
      setCharacters(result.data);
    } finally {
      setLoading(false);
    }
  };

  // Load romantic relationships
  const loadRelationships = async () => {
    try {
      let allRelationships: RomanticRelationship[] = [];
      
      if (isMockDataEnabled) {
        allRelationships = getMockRomanticRelationships() as RomanticRelationship[];
      } else {
        const data = await fetchJson<{ success: boolean; relationships: RomanticRelationship[] }>(
          '/api/conversation/romantic-relationships'
        );
        if (data.success) {
          allRelationships = data.relationships;
        }
      }

      // Create a map of character_id -> relationship
      const relationshipMap = new Map<string, RomanticRelationship>();
      allRelationships.forEach(rel => {
        if (rel.person_type === 'character') {
          relationshipMap.set(rel.person_id, rel);
        }
      });

      setRelationships(relationshipMap);
    } catch (error) {
      console.error('Failed to load relationships:', error);
    }
  };

  useEffect(() => {
    void loadCharacters();
    void loadRelationships();
  }, []);

  // Refresh when mock data toggle changes
  useEffect(() => {
    void loadCharacters();
    void loadRelationships();
  }, [isMockDataEnabled]);

  // Convert entries to MemoryCard format for modal
  useEffect(() => {
    const memoryCards = entries.map(entry => memoryEntryToCard({
      id: entry.id,
      date: entry.date,
      content: entry.content,
      summary: entry.summary || null,
      tags: entry.tags || [],
      mood: entry.mood || null,
      chapter_id: entry.chapter_id || null,
      source: entry.source || 'manual',
      metadata: entry.metadata || {}
    }));
    setAllMemories(memoryCards);
  }, [entries]);

  const filteredCharacters = useMemo(() => {
    // Filter out places - only show actual characters (people)
    let filtered = characters.filter(char => char.archetype !== 'place');
    
    // Filter by category
    if (activeCategory !== 'all') {
      filtered = filtered.filter(char => {
        switch (activeCategory) {
          case 'family':
            return char.archetype === 'family' || char.metadata?.relationship_type === 'family';
          case 'friends':
            return (char.archetype === 'friend' || char.archetype === 'ally') && 
                   char.status !== 'unmet' &&
                   (char.metadata?.relationship_type === 'friend' || !char.metadata?.relationship_type);
          case 'mentors':
            return char.archetype === 'mentor' && char.status !== 'unmet';
          case 'professional':
            return (char.archetype === 'colleague' || char.metadata?.relationship_type === 'professional') && 
                   char.status !== 'unmet';
          case 'creative':
            return char.archetype === 'collaborator' && char.status !== 'unmet';
          case 'mentioned':
            return char.status === 'unmet' || char.relationship_depth === 'mentioned_only';
          case 'direct':
            return char.proximity_level === 'direct' && (char.has_met ?? true);
          case 'indirect':
            return char.proximity_level === 'indirect';
          case 'distant':
            return char.proximity_level === 'distant';
          case 'unmet':
            return !(char.has_met ?? true) || char.proximity_level === 'unmet';
          case 'third_party':
            return char.proximity_level === 'third_party';
          default:
            return true;
        }
      });
    }
    
    // Filter by search term
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (char) =>
          char.name.toLowerCase().includes(term) ||
          char.alias?.some((a) => a.toLowerCase().includes(term)) ||
          char.summary?.toLowerCase().includes(term) ||
          char.tags?.some((t) => t.toLowerCase().includes(term)) ||
          char.archetype?.toLowerCase().includes(term) ||
          char.role?.toLowerCase().includes(term)
      );
    }
    
    return filtered;
  }, [characters, searchTerm, activeCategory]);

  // Reset to page 1 when search or category changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, activeCategory]);

  // Calculate pagination - always use grid pagination (multiple characters per page)
  const totalPages = Math.ceil(filteredCharacters.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedCharacters = filteredCharacters.slice(startIndex, endIndex);

  // Arrow key navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle arrow keys if not typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === 'ArrowLeft' && currentPage > 1) {
        e.preventDefault();
        setCurrentPage(prev => prev - 1);
      } else if (e.key === 'ArrowRight' && currentPage < totalPages) {
        e.preventDefault();
        setCurrentPage(prev => prev + 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPage, totalPages]);

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const goToPrevious = () => {
    if (currentPage > 1) {
      setCurrentPage(prev => prev - 1);
    }
  };

  const goToNext = () => {
    if (currentPage < totalPages) {
      setCurrentPage(prev => prev + 1);
    }
  };

  return (
    <div className="space-y-6">
      {/* User Profile & Insights - Displayed first */}
      <div className="space-y-4">
        <UserProfile />
      </div>

      {/* Character Search Bar and Navigation Tabs */}
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
          <Input
            type="text"
            placeholder="Search characters by name, alias, tags, or role..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
            }}
            className="pl-10 bg-black/40 border-border/50 text-white placeholder:text-white/40"
          />
        </div>
        
        {/* Navigation Tabs */}
        <Tabs value={activeCategory} onValueChange={(value) => setActiveCategory(value as CharacterCategory)}>
          <TabsList className="w-full bg-black/40 border border-border/50 p-1 h-auto">
            <TabsTrigger 
              value="all" 
              className="flex items-center gap-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary"
            >
              <Users className="h-4 w-4" />
              <span>All</span>
            </TabsTrigger>
            <TabsTrigger 
              value="family"
              className="flex items-center gap-2 data-[state=active]:bg-pink-500/20 data-[state=active]:text-pink-400"
            >
              <Heart className="h-4 w-4" />
              <span>Family</span>
            </TabsTrigger>
            <TabsTrigger 
              value="friends"
              className="flex items-center gap-2 data-[state=active]:bg-green-500/20 data-[state=active]:text-green-400"
            >
              <Users className="h-4 w-4" />
              <span>Friends</span>
            </TabsTrigger>
            <TabsTrigger 
              value="mentors"
              className="flex items-center gap-2 data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-400"
            >
              <GraduationCap className="h-4 w-4" />
              <span>Mentors</span>
            </TabsTrigger>
            <TabsTrigger 
              value="professional"
              className="flex items-center gap-2 data-[state=active]:bg-yellow-500/20 data-[state=active]:text-yellow-400"
            >
              <Briefcase className="h-4 w-4" />
              <span>Professional</span>
            </TabsTrigger>
            <TabsTrigger 
              value="creative"
              className="flex items-center gap-2 data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400"
            >
              <Palette className="h-4 w-4" />
              <span>Creative</span>
            </TabsTrigger>
            <TabsTrigger 
              value="mentioned"
              className="flex items-center gap-2 data-[state=active]:bg-orange-500/20 data-[state=active]:text-orange-400"
            >
              <MessageSquare className="h-4 w-4" />
              <span>Mentioned</span>
            </TabsTrigger>
            <TabsTrigger 
              value="direct"
              className="flex items-center gap-2 data-[state=active]:bg-green-500/20 data-[state=active]:text-green-400"
            >
              <User className="h-4 w-4" />
              <span>Direct</span>
            </TabsTrigger>
            <TabsTrigger 
              value="indirect"
              className="flex items-center gap-2 data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-400"
            >
              <Link2 className="h-4 w-4" />
              <span>Indirect</span>
            </TabsTrigger>
            <TabsTrigger 
              value="unmet"
              className="flex items-center gap-2 data-[state=active]:bg-orange-500/20 data-[state=active]:text-orange-400"
            >
              <UserX className="h-4 w-4" />
              <span>Unmet</span>
            </TabsTrigger>
            <TabsTrigger 
              value="third_party"
              className="flex items-center gap-2 data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-400"
            >
              <Eye className="h-4 w-4" />
              <span>Third Party</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
        
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Character Book</h2>
            <p className="text-sm text-white/60 mt-1">
              {characters.length} characters · {filteredCharacters.length} shown
              {totalPages > 1 && ` · Page ${currentPage} of ${totalPages}`}
              {loading && ' · Loading...'}
            </p>
          </div>
          <Button 
            leftIcon={<RefreshCw className="h-4 w-4" />} 
            onClick={() => void loadCharacters()}
            disabled={loading}
          >
            {loading ? 'Loading...' : 'Refresh'}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <CharacterCardSkeleton key={i} />
          ))}
        </div>
      ) : filteredCharacters.length === 0 ? (
        <div className="text-center py-12 text-white/60">
          <User className="h-12 w-12 mx-auto mb-4 text-white/20" />
          <p className="text-lg font-medium mb-2">No characters found</p>
          <p className="text-sm">Try a different search term or mention characters in chat to auto-create them</p>
        </div>
      ) : (
        <>
          {/* Book Page Container with Grid Inside */}
          <div className="relative w-full min-h-[600px] bg-gradient-to-br from-amber-50/5 via-amber-100/5 to-amber-50/5 rounded-lg border-2 border-amber-800/30 shadow-2xl overflow-hidden">
            {/* Page Content */}
            <div className="p-8 flex flex-col">
              {/* Page Header */}
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-amber-800/20">
                <div className="flex items-center gap-3">
                  <BookOpen className="h-6 w-6 text-amber-600/60" />
                  <div>
                    <h3 className="text-sm font-semibold text-amber-900/40 uppercase tracking-wider">
                      Character Book
                    </h3>
                    <p className="text-xs text-amber-700/50 mt-0.5">
                      Page {currentPage} of {totalPages} · {filteredCharacters.length} characters
                    </p>
                  </div>
                </div>
                <div className="text-xs text-amber-700/40 font-mono">
                  {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
              </div>

              {/* Main Character Section */}
              <MainCharacterSection user={user} />

              {/* Character Grid */}
              <div className="flex-1 grid gap-4 mb-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {paginatedCharacters.map((character, index) => {
                  try {
                    return (
                      <CharacterProfileCard
                        key={character.id || `char-${index}`}
                        character={character}
                        onClick={() => {
                          setSelectedCharacter(character);
                        }}
                      />
                    );
                  } catch {
                    return null;
                  }
                })}
              </div>

              {/* Page Footer with Navigation */}
              <div className="flex items-center justify-between pt-4 border-t border-amber-800/20">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={goToPrevious}
                  disabled={currentPage === 1}
                  className="text-amber-700/60 hover:text-amber-600 hover:bg-amber-500/10 disabled:opacity-30"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>

                <div className="flex items-center gap-2">
                  {/* Page indicators */}
                  <div className="flex items-center gap-1 px-3 py-1 bg-black/40 rounded-lg border border-amber-800/30">
                    {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                      let pageNum: number;
                      if (totalPages <= 7) {
                        pageNum = i + 1;
                      } else if (currentPage <= 4) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 3) {
                        pageNum = totalPages - 6 + i;
                      } else {
                        pageNum = currentPage - 3 + i;
                      }

                      return (
                        <button
                          key={pageNum}
                          onClick={() => goToPage(pageNum)}
                          className={`px-2 py-1 rounded text-sm transition ${
                            currentPage === pageNum
                              ? 'bg-amber-600 text-white'
                              : 'text-amber-700/60 hover:text-amber-600 hover:bg-amber-500/10'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>
                  <span className="text-sm text-amber-700/50">
                    {startIndex + 1}-{Math.min(endIndex, filteredCharacters.length)} of {filteredCharacters.length}
                  </span>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={goToNext}
                  disabled={currentPage === totalPages}
                  className="text-amber-700/60 hover:text-amber-600 hover:bg-amber-500/10 disabled:opacity-30"
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>

            {/* Book Binding Effect */}
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-amber-900/40 via-amber-800/30 to-amber-900/40" />
            <div className="absolute right-0 top-0 bottom-0 w-1 bg-gradient-to-b from-amber-900/40 via-amber-800/30 to-amber-900/40" />
          </div>
        </>
      )}

      {/* Horizontal Timeline Component - Always at bottom */}
      <div className="mt-8 pt-6 border-t border-border/50">
        <div className="mb-3">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            Timeline
          </h3>
          <p className="text-sm text-white/60 mt-1">
            {chapters.length > 0 || entries.length > 0
              ? `View your story timeline with ${chapters.length} chapter${chapters.length !== 1 ? 's' : ''} and ${entries.length} entr${entries.length !== 1 ? 'ies' : 'y'}`
              : 'Your timeline will appear here as you create chapters and entries'}
          </p>
        </div>
        <Card className="bg-black/40 border-border/60 overflow-hidden">
          <CardContent className="p-0 overflow-x-hidden">
            <div className="overflow-x-auto overflow-y-hidden">
              <ColorCodedTimeline
                chapters={chapters.length > 0 ? chapters.map(ch => ({
                  id: ch.id,
                  title: ch.title,
                  start_date: ch.start_date || ch.startDate || new Date().toISOString(),
                  end_date: ch.end_date || ch.endDate || null,
                  description: ch.description || null,
                  summary: ch.summary || null
                })) : []}
                entries={entries.length > 0 ? entries.map(entry => ({
                  id: entry.id,
                  content: entry.content,
                  date: entry.date,
                  chapter_id: entry.chapter_id || entry.chapterId || null
                })) : []}
                useDummyData={chapters.length === 0 && entries.length === 0}
                showLabel={true}
                onItemClick={async (item) => {
                  if (item.type === 'entry' || item.entryId || (item.id && entries.some(e => e.id === item.id))) {
                    // Find the entry and convert to MemoryCard
                    const entryId = item.entryId || item.id;
                    const entry = entries.find(e => e.id === entryId);
                    if (entry) {
                      const memoryCard = memoryEntryToCard({
                        id: entry.id,
                        date: entry.date,
                        content: entry.content,
                        summary: entry.summary || null,
                        tags: entry.tags || [],
                        mood: entry.mood || null,
                        chapter_id: entry.chapter_id || null,
                        source: entry.source || 'manual',
                        metadata: entry.metadata || {}
                      });
                      setSelectedMemory(memoryCard);
                    } else {
                      // Try to fetch the entry if not in local state
                      try {
                        const fetchedEntry = await fetchJson<{
                          id: string;
                          date: string;
                          content: string;
                          summary?: string | null;
                          tags: string[];
                          mood?: string | null;
                          chapter_id?: string | null;
                          source: string;
                          metadata?: Record<string, unknown>;
                        }>(`/api/entries/${entryId}`);
                        const memoryCard = memoryEntryToCard(fetchedEntry);
                        setSelectedMemory(memoryCard);
                      } catch (error) {
                        console.error('Failed to load entry:', error);
                      }
                    }
                  }
                }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {selectedCharacter && (
        <CharacterDetailModal
          character={selectedCharacter}
          relationship={relationships.get(selectedCharacter.id)}
          onClose={() => {
            setSelectedCharacter(null);
          }}
          onUpdate={() => {
            void loadCharacters();
            void loadRelationships();
            setSelectedCharacter(null);
          }}
        />
      )}

      {selectedMemory && (
        <MemoryDetailModal
          memory={selectedMemory}
          onClose={() => setSelectedMemory(null)}
          onNavigate={(memoryId) => {
            const memory = allMemories.find(m => m.id === memoryId);
            if (memory) {
              setSelectedMemory(memory);
            }
          }}
          allMemories={allMemories}
        />
      )}
    </div>
  );
};

