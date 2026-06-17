import type { ProjectSuggestion } from '../api/projects';

export function getMockProjectSuggestions(): ProjectSuggestion[] {
  return [
    {
      id: 'sug-lorebook',
      name: 'LoreBook',
      project_type: 'software',
      status: 'active',
      confidence: 0.91,
      description: 'Building the life-memory app — chat, books, and timeline.',
      reasoning: 'Detected from project language in your chats',
      evidence: ['Working on LoreBook and shipping the Projects Book this week'],
      match_status: 'new',
      source: 'chat',
    },
    {
      id: 'sug-orbit',
      name: 'Orbit Labs Onboarding',
      project_type: 'career',
      status: 'active',
      confidence: 0.84,
      description: 'Ramp-up at Orbit Labs after the bootcamp.',
      reasoning: 'Career initiative mentioned in conversation',
      evidence: ['My Orbit Labs onboarding project is eating most of my evenings'],
      match_status: 'similar',
      matched_project_name: 'Orbit Labs Onboarding',
      source: 'chat',
    },
    {
      id: 'sug-robotics',
      name: 'Robotics Build',
      project_type: 'hobby',
      status: 'completed',
      confidence: 0.78,
      description: 'Weekend robotics project with the crew.',
      reasoning: 'Project milestone detected in conversation',
      evidence: ['We finally shipped the robotics build last month'],
      match_status: 'new',
      source: 'journal',
    },
  ];
}
