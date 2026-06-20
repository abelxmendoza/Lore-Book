/**
 * Map cleaned project spans to LoreBook project taxonomy slugs.
 */

import { KNOWN_PROJECT_ALIASES, type ProjectTaxonomyType } from './projectSuggestionTypes';

const norm = (s: string) => (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

export type ProjectTaxonomyClassification = {
  projectType: ProjectTaxonomyType;
  confidence: number;
  rulesFired: string[];
};

export function classifyProjectTaxonomy(span: string, context = ''): ProjectTaxonomyClassification {
  const text = span.trim();
  const n = norm(text);
  const haystack = `${n} ${norm(context)}`;
  const rulesFired: string[] = [];

  if (KNOWN_PROJECT_ALIASES.has(n)) {
    const alias = KNOWN_PROJECT_ALIASES.get(n)!;
    if (/omega/i.test(alias)) {
      return { projectType: 'robot_build', confidence: 0.9, rulesFired: ['known_robot_alias'] };
    }
    if (/lorebook/i.test(alias)) {
      return { projectType: 'software_app', confidence: 0.92, rulesFired: ['known_product_alias'] };
    }
    if (/abeliciousness/i.test(alias)) {
      return { projectType: 'website', confidence: 0.88, rulesFired: ['known_website_alias'] };
    }
  }

  if (/\brobot\s+build\b/i.test(haystack) || /\b(freenove|jetson|ros2|arduino|raspberry pi)\b/i.test(haystack)) {
    return { projectType: 'robot_build', confidence: 0.86, rulesFired: ['robot_build_keyword'] };
  }

  if (/\b(marathon|half marathon|triathlon|training plan|workout|fitness|gym|5k|10k|couch to 5k)\b/i.test(haystack)) {
    return { projectType: 'fitness_project', confidence: 0.8, rulesFired: ['fitness_keyword'] };
  }

  if (/\b(album|ep|mixtape|single|song|track|recording|studio|novel|screenplay|short film|painting|mural|comic|zine)\b/i.test(haystack)) {
    return { projectType: 'creative_project', confidence: 0.8, rulesFired: ['creative_keyword'] };
  }

  if (/\bfeature\b/i.test(text) && text.split(/\s+/).length >= 2) {
    return { projectType: 'feature', confidence: 0.8, rulesFired: ['feature_keyword'] };
  }

  if (/\b(app|application|software|api|dashboard|memory app)\b/i.test(haystack)) {
    return { projectType: 'software_app', confidence: 0.84, rulesFired: ['software_keyword'] };
  }

  if (/\b(website|portfolio|landing page)\b/i.test(haystack)) {
    return { projectType: 'website', confidence: 0.82, rulesFired: ['website_keyword'] };
  }

  if (/\b(tutorial series|content series|archive|photo archive|brewing)\b/i.test(haystack)) {
    return { projectType: 'content_series', confidence: 0.8, rulesFired: ['content_series_keyword'] };
  }

  if (/\b(startup|venture|product launch)\b/i.test(haystack)) {
    return { projectType: 'startup', confidence: 0.78, rulesFired: ['startup_keyword'] };
  }

  if (/\b(repo|repository|github)\b/i.test(haystack)) {
    return { projectType: 'repo', confidence: 0.78, rulesFired: ['repo_keyword'] };
  }

  if (/\b(experiment|prototype|demo|proof of concept)\b/i.test(haystack)) {
    return { projectType: 'experiment', confidence: 0.75, rulesFired: ['experiment_keyword'] };
  }

  if (/^[A-Z][\w'&.-]+$/.test(text) || /^[A-Z][\w'&.-]+-\d+$/.test(text)) {
    rulesFired.push('proper_noun_anchor');
    return { projectType: 'product', confidence: 0.72, rulesFired };
  }

  if (text.split(/\s+/).length >= 2) {
    rulesFired.push('compound_modifier_anchor');
    return { projectType: 'initiative', confidence: 0.68, rulesFired };
  }

  return { projectType: 'unknown_project', confidence: 0.45, rulesFired: ['fallback_unknown'] };
}
