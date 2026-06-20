import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

import { parseResumeHeuristics } from '../../src/services/profileClaims/resumeHeuristicParser';
import { detectEmploymentGaps } from '../../src/services/profileClaims/resumeLorePopulationService';
import { parseMonthYearToken } from '../../src/services/profileClaims/resumeDateUtils';
import { resumeParsingService } from '../../src/services/profileClaims/resumeParsingService';

const FIXTURES = join(__dirname, '../fixtures/resumes');

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf-8');
}

describe('Abel Mendoza reference resumes (golden)', () => {
  const roboticsText = loadFixture('abel-robotics-2026.txt');
  const amazonText = loadFixture('abel-amazon-fat.txt');

  it('parses month-year dates from resume format', () => {
    expect(parseMonthYearToken('Apr 2026')).toBe('2026-04-01');
    expect(parseMonthYearToken('Jan 2025')).toBe('2025-01-01');
    expect(parseMonthYearToken('May 2024')).toBe('2024-05-01');
  });

  it('extracts contact and employment from robotics resume', () => {
    const parsed = parseResumeHeuristics(roboticsText);

    expect(parsed.contact.fullName).toBe('Abel Mendoza');
    expect(parsed.contact.email).toBe('test.candidate@example.com');
    expect(parsed.contact.phone).toContain('562');
    expect(parsed.contact.linkedin).toContain('linkedin.com/in/test-candidate');

    const companies = parsed.employment.map((j) => j.company);
    expect(companies).toContain('RLH Industries, Inc.');
    expect(companies).toContain('Vanguard Robotics');
    expect(companies).toContain('Serve Robotics');

    const rlh = parsed.employment.find((j) => j.company.includes('RLH'));
    expect(rlh?.title).toMatch(/Electronics Test/i);
    expect(rlh?.isCurrent).toBe(true);
    expect(rlh?.startDate).toBe('2026-04-01');

    const vanguard = parsed.employment.find((j) => j.company.includes('Vanguard'));
    expect(vanguard?.startDate).toBe('2025-01-01');
    expect(vanguard?.endDate).toBe('2025-12-01');
  });

  it('extracts projects, skills, and certifications from robotics resume', () => {
    const parsed = parseResumeHeuristics(roboticsText);

    expect(parsed.skills.length).toBeGreaterThan(10);
    expect(parsed.skills.some((s) => /ROS2/i.test(s))).toBe(true);
    expect(parsed.skills.some((s) => /Python/i.test(s))).toBe(true);

    const names = parsed.projects.map((p) => p.name);
    expect(names.some((n) => /Omega-1/i.test(n))).toBe(true);

    expect(parsed.certifications.some((c) => /FAA Part 107/i.test(c.name))).toBe(true);
    expect(parsed.education.some((e) => /Fullerton/i.test(e.institution))).toBe(true);
  });

  it('extracts Amazon FAT resume employment', () => {
    const parsed = parseResumeHeuristics(amazonText);

    expect(parsed.contact.email).toBe('test.candidate@example.com');
    expect(parsed.employment.length).toBeGreaterThanOrEqual(3);
    expect(parsed.employment[0].company).toMatch(/RLH/i);
    expect(parsed.summary).toMatch(/failure|troubleshooting|root cause/i);
  });

  it('builds claims from structured robotics parse', () => {
    const structured = parseResumeHeuristics(roboticsText);
    const claims = resumeParsingService.claimsFromStructured(structured);

    expect(claims.some((c) => c.claim_type === 'role' && c.claim_text.includes('RLH'))).toBe(true);
    expect(claims.some((c) => c.claim_type === 'skill')).toBe(true);
    expect(claims.some((c) => c.claim_type === 'certification')).toBe(true);
  });

  it('detects no large gaps between Abel jobs (overlapping Serve field role)', () => {
    const structured = parseResumeHeuristics(roboticsText);
    structured.employmentGaps = detectEmploymentGaps(structured.employment);
    // Vanguard Jan 2025 - Dec 2025 and Serve Mar-May 2025 overlap — no 2+ month gap between RLH and Vanguard
    const betweenRlhAndVanguard = structured.employmentGaps.filter((g) =>
      g.label.includes('RLH') && g.label.includes('Vanguard')
    );
    expect(betweenRlhAndVanguard.length).toBe(0);
  });
});
