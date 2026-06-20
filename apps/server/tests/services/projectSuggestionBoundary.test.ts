import { describe, it, expect } from 'vitest';

import {
  processProjectSuggestions,
  processProjectSuggestionsForOutput,
  weakProjectCandidate,
} from '../../src/services/lexical/projects/projectSuggestionService';

function acceptedNames(
  text: string,
  options?: { knownProjects?: Set<string>; activeThreadProject?: string },
  weak: ReturnType<typeof weakProjectCandidate>[] = []
): string[] {
  return processProjectSuggestionsForOutput(text, options, weak).map(s => s.text);
}

function rejectedBy(text: string, weak: ReturnType<typeof weakProjectCandidate>[] = []) {
  return processProjectSuggestions(text, undefined, weak).filter(s => s.status === 'rejected');
}

function findAccepted(text: string, part: string, options?: { knownProjects?: Set<string>; activeThreadProject?: string }) {
  return processProjectSuggestionsForOutput(text, options).find(s =>
    s.text.toLowerCase().includes(part.toLowerCase())
  );
}

describe('project suggestion boundary pipeline', () => {
  it('rejects "my project and" as generic/trailing conjunction', () => {
    const weak = [weakProjectCandidate('my project and', 'my project and')];
    expect(acceptedNames('my project and', undefined, weak)).toEqual([]);
    const rejected = rejectedBy('my project and', weak);
    expect(rejected.length).toBeGreaterThan(0);
    expect(rejected.some(r => /generic|conjunction|stopword/i.test(r.rejectionReason ?? r.rejectedAs ?? ''))).toBe(true);
  });

  it('rejects bare "project"', () => {
    const weak = [weakProjectCandidate('project', 'project')];
    expect(acceptedNames('project', undefined, weak)).toEqual([]);
    const rejected = rejectedBy('project', weak)[0];
    expect(rejected?.rejectionReason ?? rejected?.rejectedAs).toMatch(/generic_category_word/i);
  });

  it('rejects stopword "and"', () => {
    const weak = [weakProjectCandidate('and', 'and')];
    expect(acceptedNames('and', undefined, weak)).toEqual([]);
    const rejected = rejectedBy('and', weak)[0];
    expect(rejected?.rejectionReason ?? rejected?.rejectedAs).toMatch(/stopword/i);
  });

  it('splits LoreBook and Omega-1 without project-and span', () => {
    const text = 'the LoreBook project and Omega-1 build';
    const names = acceptedNames(text);
    expect(names.some(n => /lorebook/i.test(n))).toBe(true);
    expect(names.some(n => /omega-1/i.test(n))).toBe(true);
    expect(names.some(n => /project and/i.test(n))).toBe(false);
  });

  it('extracts AI memory app as software_app candidate', () => {
    const text = 'I am building an AI memory app';
    const app = findAccepted(text, 'AI memory app');
    expect(app).toBeDefined();
    expect(app!.projectType).toMatch(/software_app|product|initiative/);
  });

  it('extracts Freenove robot build as robot_build', () => {
    const text = 'My Freenove robot build uses Raspberry Pi';
    const build = findAccepted(text, 'Freenove robot build');
    expect(build).toBeDefined();
    expect(build!.projectType).toBe('robot_build');
  });

  it('extracts Abeliciousness and personal website references', () => {
    const text = 'I worked on my personal website Abeliciousness';
    const names = acceptedNames(text);
    expect(names.some(n => /abeliciousness/i.test(n))).toBe(true);
    expect(names.some(n => /personal website/i.test(n))).toBe(true);
  });

  it('does not create new project for "this project" when thread resolves to LoreBook', () => {
    const text = 'this project needs better tests';
    const weak = [weakProjectCandidate('this project', text)];
    expect(acceptedNames(text, { activeThreadProject: 'LoreBook' }, weak)).toEqual([]);
    const reference = processProjectSuggestions(text, { activeThreadProject: 'LoreBook' }, weak).find(
      s => s.status === 'reference'
    );
    expect(reference).toBeDefined();
    expect(reference?.rejectionReason).toMatch(/LoreBook/i);
  });

  it('extracts LoreBook and Lexical Analyzer feature from feature sentence', () => {
    const text = 'I added the Lexical Analyzer feature to LoreBook';
    const names = acceptedNames(text);
    expect(names.some(n => /lorebook/i.test(n))).toBe(true);
    expect(names.some(n => /lexical analyzer feature/i.test(n))).toBe(true);
  });

  it('does not hard-suggest generic "my app and my robot" without anchors', () => {
    const text = 'my app and my robot';
    const weak = [
      weakProjectCandidate('my app', text, 0.6),
      weakProjectCandidate('my robot', text, 0.6),
      weakProjectCandidate('and', text, 0.5),
    ];
    const accepted = processProjectSuggestionsForOutput(text, undefined, weak);
    expect(accepted.every(s => s.status === 'needs_review')).toBe(true);
  });

  it('filters generic glossary noise from output', () => {
    const text = 'working on project';
    const weak = [
      weakProjectCandidate('project', text),
      weakProjectCandidate('and', text),
    ];
    expect(acceptedNames(text, undefined, weak)).toEqual([]);
  });
});
