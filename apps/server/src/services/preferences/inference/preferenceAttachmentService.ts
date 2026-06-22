import type { PreferenceAttachedTo, PreferenceDomain } from './preferenceInferenceTypes';

export function inferDomain(displayName: string, text: string): PreferenceDomain {
  const blob = `${displayName} ${text}`.toLowerCase();
  if (/\b(?:ska|punk|metal|music|shows?|band|concert)\b/.test(blob)) return 'music';
  if (/\b(?:one piece|anime|manga|movie|show|netflix|media)\b/.test(blob)) return 'media';
  if (/\b(?:food|eat|restaurant|taco|pizza)\b/.test(blob)) return 'food';
  if (/\b(?:tequila|drink|coffee|beer|wine)\b/.test(blob)) return 'drink';
  if (/\b(?:clothes|clothing|outfit|summer clothes|fashion)\b/.test(blob)) return 'clothing';
  if (/\b(?:robotics|ros2|ai|tech|software)\b/.test(blob)) return 'robotics';
  if (/\b(?:muay thai|martial|train|gym|fight)\b/.test(blob)) return 'martial_arts';
  if (/\b(?:duolingo|japanese|language|learn)\b/.test(blob)) return 'language_learning';
  if (/\b(?:gothic|occult|aesthetic|vibe|theme|purple|cyberpunk)\b/.test(blob)) return 'aesthetic';
  if (/\b(?:lorebook|ui|entity chips|forgetful ai|product)\b/.test(blob)) return 'product';
  if (/\b(?:drive|driving|far drive|commute)\b/.test(blob)) return 'lifestyle';
  if (/\b(?:relationship|dating|crush)\b/.test(blob)) return 'relationship';
  if (/\b(?:work|job|career)\b/.test(blob)) return 'work';
  return 'unknown';
}

export function attachPreferenceTarget(
  displayName: string,
  text: string,
  domain: PreferenceDomain,
): PreferenceAttachedTo {
  if (/\bLoreBook\b/i.test(text) || domain === 'product') {
    return { entityType: 'project', inferredTitle: 'LoreBook' };
  }
  if (domain === 'martial_arts' && /\bmuay thai\b/i.test(displayName)) {
    return { entityType: 'skill', inferredTitle: 'Muay Thai' };
  }
  if (domain === 'music' && /\b(?:ska|punk|metal)\b/i.test(displayName)) {
    return { entityType: 'group', inferredTitle: `${displayName} scene` };
  }
  if (domain === 'aesthetic') {
    return { entityType: 'user_profile', inferredTitle: 'taste profile' };
  }
  if (domain === 'lifestyle' && /\bdrive\b/i.test(displayName)) {
    return { entityType: 'user_profile', inferredTitle: 'travel preferences' };
  }
  return { entityType: 'user_profile', inferredTitle: 'user preferences' };
}
