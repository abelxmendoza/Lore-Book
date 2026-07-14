/**
 * Resume Import Parser tests — per spec:
 * - parses identity header, work history with dates, skills, projects,
 *   education, certifications (FAA Part 107 / ITAR), languages, career targets
 * - blocks role titles from the Character Book
 * - detects conflicts between resume-current jobs and existing current role
 * - every imported claim carries section + quote provenance
 */
import { describe, expect, it } from 'vitest';

import { evaluateWrongDomain } from '../characters/audit/wrongDomainCharacterGuard';

import { mergeParsedResume, parseResumeHeuristics } from './resumeHeuristicParser';
import { resumeParsingService } from './resumeParsingService';
import { detectCurrentRoleConflicts } from './resumeRoleConflictService';
import type { ParsedResume } from './resumeStructuredTypes';

const SAMPLE_RESUME = `Abel Mendoza
Anaheim, CA | sample.person@example.com | (555) 123-4567 | linkedin.com/in/abelmendoza

Professional Summary
Robotics & Embedded Systems Engineer focused on embedded autonomy, aerospace and defense
applications, distributed robotics, and embedded systems validation.

Technical Skills
Robotics & Autonomy: ROS2, PX4, MAVLink, OpenCV, ArUco
Embedded & Compute: Jetson, Raspberry Pi
Programming & Tools: Python, C++, Go, TypeScript, Docker, Linux

Professional Experience
Electronics Test & Validation Technician Apr 2026 – Present
RLH Industries — Orange, CA
• Tested and validated DC-DC converters and fiber optic communication products.
• Performed failure analysis on returned units.

Robotics Deployment Technician Jun 2025 – Mar 2026
Vanguard Robotics — Los Angeles, CA
• Calibrated grippers and deployed robotic systems at customer sites.

Field Robotics Agent Jan 2024 – May 2025
Serve Robotics — Los Angeles, CA
• Deployed and recovered sidewalk delivery robots in the field.

Technical Projects
Omega-1 — Distributed Autonomous Robotics Platform
• Built a distributed autonomous robotics platform with ROS2 and PX4.

Education
California State University, Fullerton May 2024
Bachelor of Science in Computer Science

Additional
FAA Part 107 Certified. U.S. Citizen, ITAR/EAR eligible.
Languages: English, Spanish
`;

describe('resume heuristic parser', () => {
  const parsed = parseResumeHeuristics(SAMPLE_RESUME);

  it('parses the identity header', () => {
    expect(parsed.contact.fullName).toBe('Abel Mendoza');
    expect(parsed.contact.email).toBe('sample.person@example.com');
    expect(parsed.contact.address).toContain('Anaheim, CA');
    expect(parsed.contact.linkedin).toBe('linkedin.com/in/abelmendoza');
  });

  it('parses work history with dates and current flag', () => {
    const companies = parsed.employment.map((j) => j.company);
    expect(companies).toEqual(
      expect.arrayContaining(['RLH Industries', 'Vanguard Robotics', 'Serve Robotics'])
    );

    const rlh = parsed.employment.find((j) => j.company === 'RLH Industries')!;
    expect(rlh.title).toBe('Electronics Test & Validation Technician');
    expect(rlh.isCurrent).toBe(true);
    expect(rlh.startDate).toMatch(/^2026-04/);

    const armstrong = parsed.employment.find((j) => j.company === 'Vanguard Robotics')!;
    expect(armstrong.isCurrent).toBe(false);
    expect(armstrong.endDate).toMatch(/^2026-03/);
  });

  it('parses technical skills from category lines', () => {
    expect(parsed.skills).toEqual(
      expect.arrayContaining(['ROS2', 'PX4', 'MAVLink', 'OpenCV', 'Jetson', 'Python', 'C++'])
    );
  });

  it('parses projects', () => {
    expect(parsed.projects.map((p) => p.name)).toContain('Omega-1');
  });

  it('parses education', () => {
    expect(
      parsed.education.some((e) => e.institution.includes('California State University'))
    ).toBe(true);
  });

  it('parses FAA Part 107 and ITAR eligibility as certifications', () => {
    const names = parsed.certifications.map((c) => c.name);
    expect(names).toContain('FAA Part 107 Certified');
    expect(names).toContain('ITAR/EAR Eligible (U.S. Citizen)');
  });

  it('parses spoken languages without picking up programming-language lines', () => {
    expect(parsed.languages).toEqual(['English', 'Spanish']);
  });

  it('detects career targets from the summary', () => {
    expect(parsed.careerTargets).toEqual(
      expect.arrayContaining(['robotics', 'aerospace', 'defense', 'ITAR/EAR eligible'])
    );
  });

  it('merges languages and career targets from LLM and heuristic passes', () => {
    const llm: ParsedResume = {
      ...parsed,
      languages: ['English', 'American Sign Language'],
      careerTargets: ['embedded autonomy'],
    };
    const merged = mergeParsedResume(llm, parsed);
    expect(merged.languages).toEqual(
      expect.arrayContaining(['English', 'Spanish', 'American Sign Language'])
    );
    expect(merged.careerTargets).toEqual(expect.arrayContaining(['embedded autonomy', 'robotics']));
  });
});

describe('claims provenance', () => {
  const parsed = parseResumeHeuristics(SAMPLE_RESUME);
  const claims = resumeParsingService.claimsFromStructured(parsed);

  it('attaches a resume section to every claim', () => {
    expect(claims.length).toBeGreaterThan(0);
    expect(claims.every((c) => typeof c.section === 'string' && c.section.length > 0)).toBe(true);
  });

  it('maps claims to the right sections', () => {
    const role = claims.find((c) => c.claim_type === 'role');
    expect(role?.section).toBe('employment');
    const skill = claims.find((c) => c.claim_type === 'skill' && !c.claim_text.startsWith('Language:'));
    expect(skill?.section).toBe('skills');
    const language = claims.find((c) => c.claim_text === 'Language: Spanish');
    expect(language?.section).toBe('languages');
    const target = claims.find((c) => c.claim_text.startsWith('Career target:'));
    expect(target?.section).toBe('summary');
    const email = claims.find((c) => c.claim_text.startsWith('Email:'));
    expect(email?.section).toBe('header');
  });
});

describe('role titles are blocked from the Character Book', () => {
  it.each([
    'Quality Assurance Technician',
    'Electronics Test & Validation Technician',
    'Robotics Deployment Technician',
    'Field Robotics Agent',
    'Robotics & Embedded Systems Engineer',
  ])('blocks "%s"', (title) => {
    expect(evaluateWrongDomain(title).wrongDomain).toBe(true);
  });

  it.each(['Rene Alvarez', 'Kavi'])('allows real person name "%s"', (name) => {
    expect(evaluateWrongDomain(name).wrongDomain).toBe(false);
  });

  it('allows a role-shaped label when provenance shows it names a person', () => {
    expect(
      evaluateWrongDomain(
        'Quality Assurance Technician',
        'my coworker everyone calls Quality Assurance Technician as a nickname'
      ).wrongDomain
    ).toBe(false);
  });
});

describe('current-role conflict detection', () => {
  const rlhCurrent = {
    company: 'RLH Industries',
    title: 'Electronics Test & Validation Technician',
    isCurrent: true,
  };
  const ringExisting = {
    organization: 'Ring',
    title: 'Quality Assurance Technician',
    source: 'chat history',
  };

  it('flags a resume-current job that disagrees with the existing current employer', () => {
    const conflicts = detectCurrentRoleConflicts([rlhCurrent], [ringExisting]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].resumeCompany).toBe('RLH Industries');
    expect(conflicts[0].existingOrganization).toBe('Ring');
    expect(conflicts[0].reason).toContain('Needs review');
  });

  it('does not flag agreement with the existing current employer', () => {
    const conflicts = detectCurrentRoleConflicts(
      [{ company: 'Ring', title: 'Quality Assurance Technician', isCurrent: true }],
      [ringExisting]
    );
    expect(conflicts).toHaveLength(0);
  });

  it('ignores past jobs regardless of company', () => {
    const conflicts = detectCurrentRoleConflicts(
      [{ company: 'Serve Robotics', title: 'Field Robotics Agent', isCurrent: false }],
      [ringExisting]
    );
    expect(conflicts).toHaveLength(0);
  });

  it('is silent when LoreBook has no current employer yet', () => {
    expect(detectCurrentRoleConflicts([rlhCurrent], [])).toHaveLength(0);
  });
});
