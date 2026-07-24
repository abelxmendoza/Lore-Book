/**
 * Title generation + quality gate — reject taxonomy placeholders.
 */

import type { AnchorTitleQuality } from './narrativeAnchorCognitionTypes';

const PLACEHOLDER =
  /^(family|work|social|goth|ska|school|other|general|life)\s+(period|community|chapter|phase|era|group)$/i;

const WEAK =
  /^(community|household|family|period|chapter)$/i;

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function isPlaceholderTitle(title: string): boolean {
  const t = (title ?? '').trim();
  return !t || PLACEHOLDER.test(t) || WEAK.test(t) || /community$/i.test(t) && t.split(/\s+/).length <= 3;
}

export function scoreTitleQuality(input: {
  title: string;
  eventTitles?: string[];
  peopleNames?: string[];
  userCentrality?: number;
}): AnchorTitleQuality {
  const title = (input.title ?? '').trim();
  const reasons: string[] = [];
  let placeholderPenalty = 0;
  if (isPlaceholderTitle(title)) {
    placeholderPenalty = 0.85;
    reasons.push('placeholder_title');
  }

  let specificity = Math.min(0.9, title.length / 40);
  if (/\b(at|while|and|after|during)\b/i.test(title)) {
    specificity = Math.max(specificity, 0.7);
    reasons.push('relational_preposition');
  }
  if ((input.eventTitles ?? []).some((e) => e && title.toLowerCase().includes(e.toLowerCase().slice(0, 20)))) {
    specificity = Math.max(specificity, 0.85);
    reasons.push('event_title_aligned');
  }

  let distinctiveness = title.split(/\s+/).length >= 4 ? 0.7 : 0.35;
  if (placeholderPenalty > 0) distinctiveness = 0.1;

  let narrativeMeaning = placeholderPenalty > 0 ? 0.1 : 0.55;
  if (/\b(building|graduation|starting|collapse|returning|party|circle|while)\b/i.test(title)) {
    narrativeMeaning = 0.8;
    reasons.push('narrative_verb_or_event');
  }

  const userCentrality = input.userCentrality ?? 0.5;
  let entityLeakagePenalty = 0;
  // Possessive person residue
  if (/['’]s$/i.test(title) && !/\b(house|home|party|household)\b/i.test(title)) {
    entityLeakagePenalty = 0.3;
    reasons.push('possessive_leakage');
  }

  const finalScore = clamp01(
    specificity * 0.25
      + distinctiveness * 0.2
      + narrativeMeaning * 0.25
      + userCentrality * 0.15
      - placeholderPenalty * 0.5
      - entityLeakagePenalty,
  );

  return {
    specificity,
    distinctiveness,
    narrativeMeaning,
    userCentrality,
    placeholderPenalty,
    entityLeakagePenalty,
    finalScore,
    reasons,
  };
}

/**
 * Prefer a concrete event title over generic category titles.
 */
export function synthesizeAnchorTitle(input: {
  currentTitle: string;
  eventTitles?: string[];
  placeNames?: string[];
  groupNames?: string[];
  peopleNames?: string[];
  evidenceText?: string;
}): { title: string; theme?: string; reasons: string[] } {
  const reasons: string[] = [];
  const events = (input.eventTitles ?? []).filter(Boolean);
  const places = input.placeNames ?? [];
  const groups = input.groupNames ?? [];

  if (events.length === 1 && events[0]!.length >= 8) {
    let title = events[0]!;
    // Enrich with place if not already in title
    const place = places[0];
    if (place && !title.toLowerCase().includes(place.toLowerCase().slice(0, 8))) {
      if (/\bhouse|home|club|metro\b/i.test(place)) {
        title = `${title} at ${place}`;
        reasons.push('append_place_to_event');
      }
    }
    reasons.push('prefer_event_title');
    return {
      title,
      theme: `Centered on the event "${events[0]}" as a memorable life moment.`,
      reasons,
    };
  }

  if (events.length >= 2) {
    // Prefer most specific (longest meaningful) event as lead
    const lead = [...events].sort((a, b) => b.length - a.length)[0]!;
    if (!isPlaceholderTitle(lead)) {
      reasons.push('multi_event_lead');
      return {
        title: lead,
        theme: `Multiple linked events form a chapter led by "${lead}".`,
        reasons,
      };
    }
  }

  // Club + group social chapter
  const clubPlace = places.find((p) => /club|metro|venue/i.test(p));
  const socialGroup = groups.find((g) => /goth|ska|band|los\s/i.test(g));
  if (clubPlace && socialGroup) {
    reasons.push('social_circle_chapter');
    return {
      title: `${clubPlace} and the ${socialGroup} Circle`,
      theme: `Recurring social life around ${clubPlace} with ${socialGroup}.`,
      reasons,
    };
  }

  // Project + family place
  const projectEvent = events.find((e) => /lorebook|building/i.test(e));
  const familyPlace = places.find((p) => /abuela|house|home|grace/i.test(p));
  if (projectEvent && familyPlace) {
    reasons.push('project_while_family');
    return {
      title: `Building LoreBook While Living with Family`,
      theme: `Project work interleaved with family living contexts.`,
      reasons,
    };
  }

  if (!isPlaceholderTitle(input.currentTitle)) {
    reasons.push('keep_existing_title');
    return { title: input.currentTitle, reasons };
  }

  reasons.push('could_not_synthesize_strong_title');
  return {
    title: input.currentTitle,
    reasons,
  };
}
