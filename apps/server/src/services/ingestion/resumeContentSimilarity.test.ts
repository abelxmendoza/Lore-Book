import { describe, expect, it } from 'vitest';

import { isNearDuplicateResume, resumeContentSimilarity } from './resumeContentSimilarity';

const ORIGINAL = `
Marcus Reed
Experience
Senior Systems Engineer, Vanguard Robotics, January 2022 to Present
Designed distributed robotics control systems and improved deployment reliability.
Software Engineer, MemoVault, June 2019 to December 2021
Built TypeScript services, PostgreSQL data pipelines, and automated testing.
Education
Bachelor of Science in Computer Science, State University, 2019
Skills
TypeScript, Node.js, PostgreSQL, Docker, AWS, distributed systems, testing
`.trim();

describe('resumeContentSimilarity', () => {
  it('recognizes the same resume after formatting and punctuation changes', () => {
    const reformatted = ORIGINAL
      .replaceAll(',', ' | ')
      .replaceAll('\n', '   ')
      .replace('January 2022 to Present', 'January 2022 - Present');

    expect(resumeContentSimilarity(ORIGINAL, reformatted)).toBeGreaterThan(0.94);
    expect(isNearDuplicateResume(ORIGINAL, reformatted)).toBe(true);
  });

  it('does not discard a materially updated resume with a new role', () => {
    const updated = `${ORIGINAL}\nPrincipal Engineer, Meridian Test Labs, February 2026 to Present\nLed a new hardware validation organization and reliability program.`;

    expect(isNearDuplicateResume(ORIGINAL, updated)).toBe(false);
  });

  it('does not compare short snippets as resumes', () => {
    expect(isNearDuplicateResume('Engineer at Vanguard Robotics', 'Engineer at Vanguard Robotics')).toBe(false);
  });
});
