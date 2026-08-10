import { describe, expect, it } from 'vitest';

import { buildResumeChatFeedback } from '../../src/services/profileClaims/resumeFeedbackService';
import type { ParsedResume } from '../../src/services/profileClaims/resumeStructuredTypes';

const fictionalResume: ParsedResume = {
  contact: { fullName: 'Jordan Vega', email: 'jordan@test.com' },
  summary: 'Robotics engineer with field deployment experience.',
  employment: [
    {
      company: 'Meridian Test Labs, Inc.',
      title: 'Electronics Test & Validation Technician',
      startDate: '2026-04-01',
      isCurrent: true,
    },
    {
      company: 'Vanguard Robotics',
      title: 'Robotics Deployment Technician',
      startDate: '2025-01-01',
      endDate: '2025-12-01',
    },
  ],
  education: [
    {
      institution: 'Meridian State University',
      degree: 'Bachelor of Science — Computer Science',
      endDate: '2024-05-01',
    },
  ],
  skills: ['ROS2', 'Python', 'PX4'],
  projects: [{ name: 'Atlas Drive' }],
  certifications: [{ name: 'FAA Part 107 Certified' }],
  employmentGaps: [],
};

describe('resumeFeedbackService', () => {
  it('builds chat feedback with career and education timelines', () => {
    const result = buildResumeChatFeedback({
      parsed: fictionalResume,
      fileName: 'JordanVega_Resume.pdf',
      userFileId: 'file-1',
      counts: {
        claims: 12,
        journalEntries: 8,
        timelineEvents: 5,
        skills: 3,
        organizations: 2,
        characterAttributes: 10,
      },
    });

    expect(result.chatFeedback).toContain('Jordan Vega');
    expect(result.chatFeedback).toContain('Documents library');
    expect(result.chatFeedback).toContain('Career timeline');
    expect(result.chatFeedback).toContain('Education timeline');
    expect(result.chatFeedback).toContain('Meridian Test Labs');
    expect(result.chatFeedback).toContain('Meridian State');
    expect(result.careerTimeline).toHaveLength(2);
    expect(result.educationTimeline).toHaveLength(1);
    expect(result.savedToLibrary).toBe(true);
  });
});
