import { describe, expect, it } from 'vitest';

import { buildResumeChatFeedback } from '../../src/services/profileClaims/resumeFeedbackService';
import type { ParsedResume } from '../../src/services/profileClaims/resumeStructuredTypes';

const abelResume: ParsedResume = {
  contact: { fullName: 'Abel Mendoza', email: 'abel@test.com' },
  summary: 'Robotics engineer with field deployment experience.',
  employment: [
    {
      company: 'RLH Industries, Inc.',
      title: 'Electronics Test & Validation Technician',
      startDate: '2026-04-01',
      isCurrent: true,
    },
    {
      company: 'Armstrong Robotics',
      title: 'Robotics Deployment Technician',
      startDate: '2025-01-01',
      endDate: '2025-12-01',
    },
  ],
  education: [
    {
      institution: 'California State University, Fullerton',
      degree: 'Bachelor of Science — Computer Science',
      endDate: '2024-05-01',
    },
  ],
  skills: ['ROS2', 'Python', 'PX4'],
  projects: [{ name: 'Omega-1' }],
  certifications: [{ name: 'FAA Part 107 Certified' }],
  employmentGaps: [],
};

describe('resumeFeedbackService', () => {
  it('builds chat feedback with career and education timelines', () => {
    const result = buildResumeChatFeedback({
      parsed: abelResume,
      fileName: 'AbelMendoza_Resume.pdf',
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

    expect(result.chatFeedback).toContain('Abel Mendoza');
    expect(result.chatFeedback).toContain('Documents library');
    expect(result.chatFeedback).toContain('Career timeline');
    expect(result.chatFeedback).toContain('Education timeline');
    expect(result.chatFeedback).toContain('RLH Industries');
    expect(result.chatFeedback).toContain('Fullerton');
    expect(result.careerTimeline).toHaveLength(2);
    expect(result.educationTimeline).toHaveLength(1);
    expect(result.savedToLibrary).toBe(true);
  });
});
