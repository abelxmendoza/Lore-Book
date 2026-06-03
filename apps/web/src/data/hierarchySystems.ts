/**
 * Pre-defined Hierarchy Systems
 *
 * These are reusable rank frameworks — not tied to any one organization.
 * A martial arts gym, a military unit, a company, a family — all use the
 * same HierarchySystem shape, just with different levels.
 *
 * Philosophy: LoreBook should understand "my sensei" the same way it understands
 * "my boss" — through natural language, not manual data entry. These systems
 * provide the vocabulary to describe what the inference service detects.
 */

import type { HierarchySystem } from '../types/socialRoles';

// ── Brazilian Jiu-Jitsu ───────────────────────────────────────────────────────

export const BJJ: HierarchySystem = {
  id: 'bjj',
  name: 'Brazilian Jiu-Jitsu',
  domain: 'martial_arts',
  description: 'Belt-based rank progression in BJJ. Each belt typically requires years of consistent training and technical mastery.',
  progression: 'linear',
  levels: [
    { order: 1, title: 'White Belt',  abbreviation: 'White',  color: '#e5e7eb', bg_color: '#f3f4f6', symbol: '⬜', description: 'Beginning — learning the fundamentals' },
    { order: 2, title: 'Blue Belt',   abbreviation: 'Blue',   color: '#3b82f6', bg_color: '#1d4ed8', symbol: '🟦', min_years: 2, description: 'Core techniques established. The largest group in most gyms.' },
    { order: 3, title: 'Purple Belt', abbreviation: 'Purple', color: '#8b5cf6', bg_color: '#6d28d9', symbol: '🟣', min_years: 1.5, description: 'Intermediate mastery. Often assists with instruction.' },
    { order: 4, title: 'Brown Belt',  abbreviation: 'Brown',  color: '#92400e', bg_color: '#78350f', symbol: '🟫', min_years: 1,   description: 'Advanced. Refining and personalizing technique.' },
    { order: 5, title: 'Black Belt',  abbreviation: 'Black',  color: '#1f2937', bg_color: '#111827', symbol: '⬛', min_years: 3,   description: 'Expert. The journey, not the destination.' },
    { order: 6, title: 'Coral Belt',  abbreviation: 'Coral',  color: '#ef4444', bg_color: '#b91c1c', symbol: '🔴', min_years: 7,   description: 'Grand Master level — decades of contribution to the art.' },
    { order: 7, title: 'Red Belt',    abbreviation: 'Red',    color: '#dc2626', bg_color: '#991b1b', symbol: '🔴', min_years: 10,  description: 'Highest recognition. Foundational figures in BJJ history.' },
  ],
};

// ── Judo ─────────────────────────────────────────────────────────────────────

export const JUDO: HierarchySystem = {
  id: 'judo',
  name: 'Judo',
  domain: 'martial_arts',
  progression: 'linear',
  levels: [
    { order: 1,  title: 'White Belt',        color: '#e5e7eb', bg_color: '#f3f4f6', symbol: '⬜' },
    { order: 2,  title: 'Yellow Belt',       color: '#fbbf24', bg_color: '#d97706', symbol: '🟨' },
    { order: 3,  title: 'Orange Belt',       color: '#f97316', bg_color: '#ea580c', symbol: '🟧' },
    { order: 4,  title: 'Green Belt',        color: '#22c55e', bg_color: '#16a34a', symbol: '🟩' },
    { order: 5,  title: 'Blue Belt',         color: '#3b82f6', bg_color: '#1d4ed8', symbol: '🟦' },
    { order: 6,  title: 'Brown Belt',        color: '#92400e', bg_color: '#78350f', symbol: '🟫' },
    { order: 7,  title: '1st Dan Black',     color: '#1f2937', bg_color: '#111827', symbol: '⬛' },
    { order: 8,  title: '2nd Dan Black',     color: '#1f2937', bg_color: '#111827', symbol: '⬛⬛' },
    { order: 9,  title: '3rd Dan Black',     color: '#1f2937', bg_color: '#111827', symbol: '⬛⬛⬛' },
    { order: 10, title: '4th Dan Black',     color: '#1f2937', bg_color: '#111827', symbol: '⬛⬛⬛⬛' },
    { order: 11, title: '5th Dan Red/White', color: '#ef4444', bg_color: '#b91c1c', symbol: '🔴⬜' },
    { order: 12, title: '6th Dan Red/White', color: '#ef4444', bg_color: '#b91c1c', symbol: '🔴⬜' },
    { order: 13, title: '9th Dan Red',       color: '#dc2626', bg_color: '#991b1b', symbol: '🔴' },
    { order: 14, title: '10th Dan Red',      color: '#dc2626', bg_color: '#991b1b', symbol: '🔴🔴' },
  ],
};

// ── Generic Martial Arts (for unspecified styles) ─────────────────────────────

export const MARTIAL_ARTS_GENERIC: HierarchySystem = {
  id: 'martial_arts_generic',
  name: 'Martial Arts',
  domain: 'martial_arts',
  progression: 'linear',
  levels: [
    { order: 1, title: 'Student',     symbol: '👤', description: 'Learning the basics' },
    { order: 2, title: 'Practitioner', symbol: '🥋', description: 'Established practice' },
    { order: 3, title: 'Advanced',    symbol: '⭐', description: 'Advanced skills' },
    { order: 4, title: 'Instructor',  symbol: '🏅', description: 'Teaching others' },
    { order: 5, title: 'Master',      symbol: '👑', description: 'Mastery and leadership' },
  ],
};

// ── Military (US-style enlisted) ─────────────────────────────────────────────

export const MILITARY_ENLISTED: HierarchySystem = {
  id: 'military_enlisted',
  name: 'Military (Enlisted)',
  domain: 'workplace',
  description: 'Enlisted rank structure. Inferred from journal language: "my sergeant", "my lieutenant", "my captain".',
  progression: 'linear',
  levels: [
    { order: 1,  title: 'Private',             abbreviation: 'Pvt',   symbol: '▪', color: '#6b7280' },
    { order: 2,  title: 'Private First Class',  abbreviation: 'PFC',   symbol: '▪▪', color: '#6b7280' },
    { order: 3,  title: 'Specialist',           abbreviation: 'SPC',   symbol: '◆', color: '#6b7280' },
    { order: 4,  title: 'Corporal',             abbreviation: 'Cpl',   symbol: '◆◆', color: '#6b7280' },
    { order: 5,  title: 'Sergeant',             abbreviation: 'Sgt',   symbol: '▲', color: '#d97706' },
    { order: 6,  title: 'Staff Sergeant',       abbreviation: 'SSgt',  symbol: '▲▲', color: '#d97706' },
    { order: 7,  title: 'Sergeant First Class', abbreviation: 'SFC',   symbol: '▲▲▲', color: '#d97706' },
    { order: 8,  title: 'Master Sergeant',      abbreviation: 'MSG',   symbol: '★', color: '#f59e0b' },
    { order: 9,  title: 'Sergeant Major',       abbreviation: 'SGM',   symbol: '★★', color: '#f59e0b' },
    { order: 10, title: 'Command Sergeant Major', abbreviation: 'CSM', symbol: '★★★', color: '#ef4444' },
  ],
};

export const MILITARY_OFFICER: HierarchySystem = {
  id: 'military_officer',
  name: 'Military (Officer)',
  domain: 'workplace',
  progression: 'linear',
  levels: [
    { order: 1, title: 'Second Lieutenant', abbreviation: '2LT',  symbol: '⬜', color: '#6b7280' },
    { order: 2, title: 'First Lieutenant',  abbreviation: '1LT',  symbol: '⬜⬜', color: '#6b7280' },
    { order: 3, title: 'Captain',           abbreviation: 'CPT',  symbol: '⬛⬛', color: '#374151' },
    { order: 4, title: 'Major',             abbreviation: 'MAJ',  symbol: '🍁', color: '#d97706' },
    { order: 5, title: 'Lieutenant Colonel',abbreviation: 'LTC',  symbol: '🍁🍁', color: '#d97706' },
    { order: 6, title: 'Colonel',           abbreviation: 'COL',  symbol: '🦅', color: '#ef4444' },
    { order: 7, title: 'Brigadier General', abbreviation: 'BG',   symbol: '★', color: '#f59e0b' },
    { order: 8, title: 'Major General',     abbreviation: 'MG',   symbol: '★★', color: '#f59e0b' },
    { order: 9, title: 'Lieutenant General',abbreviation: 'LTG',  symbol: '★★★', color: '#f59e0b' },
    { order: 10,title: 'General',           abbreviation: 'GEN',  symbol: '★★★★', color: '#f59e0b' },
  ],
};

// ── Corporate ────────────────────────────────────────────────────────────────

export const CORPORATE: HierarchySystem = {
  id: 'corporate',
  name: 'Corporate',
  domain: 'workplace',
  description: 'Inferred from: "my intern", "my junior", "my senior", "my manager", "my VP", "my CEO".',
  progression: 'linear',
  levels: [
    { order: 1, title: 'Intern',         symbol: '○', color: '#9ca3af', description: 'Learning the ropes' },
    { order: 2, title: 'Junior',         symbol: '●', color: '#6b7280', description: 'Entry-level contributor' },
    { order: 3, title: 'Mid-level',      symbol: '●●', color: '#4b5563', description: 'Independent contributor' },
    { order: 4, title: 'Senior',         symbol: '●●●', color: '#374151', description: 'Expert individual contributor' },
    { order: 5, title: 'Lead / Staff',   symbol: '◆', color: '#3b82f6', description: 'Technical or team leadership' },
    { order: 6, title: 'Manager',        symbol: '▲', color: '#8b5cf6', description: 'People management' },
    { order: 7, title: 'Director',       symbol: '▲▲', color: '#7c3aed', description: 'Department leadership' },
    { order: 8, title: 'VP',             symbol: '▲▲▲', color: '#d97706', description: 'Division leadership' },
    { order: 9, title: 'C-Level',        symbol: '★', color: '#f59e0b', description: 'Executive leadership' },
    { order: 10,title: 'Founder / Owner',symbol: '👑', color: '#ef4444', description: 'Founder or owner' },
  ],
};

// ── Academic ─────────────────────────────────────────────────────────────────

export const ACADEMIC: HierarchySystem = {
  id: 'academic',
  name: 'Academia',
  domain: 'education',
  progression: 'linear',
  levels: [
    { order: 1, title: 'Undergraduate',      symbol: '○', color: '#6b7280' },
    { order: 2, title: 'Graduate Student',   symbol: '●', color: '#4b5563' },
    { order: 3, title: 'PhD Candidate',      symbol: '◆', color: '#374151' },
    { order: 4, title: 'Postdoctoral',       symbol: '◆◆', color: '#3b82f6' },
    { order: 5, title: 'Lecturer',           symbol: '▪', color: '#6366f1' },
    { order: 6, title: 'Assistant Professor',symbol: '▲', color: '#8b5cf6' },
    { order: 7, title: 'Associate Professor',symbol: '▲▲', color: '#7c3aed' },
    { order: 8, title: 'Full Professor',     symbol: '▲▲▲', color: '#d97706' },
    { order: 9, title: 'Emeritus',           symbol: '★', color: '#f59e0b' },
  ],
};

// ── Family (generational) ─────────────────────────────────────────────────────

export const FAMILY_GENERATIONAL: HierarchySystem = {
  id: 'family_generational',
  name: 'Family Generations',
  domain: 'family',
  description: 'Generational hierarchy — not about authority, but about lineage and legacy.',
  progression: 'linear',
  levels: [
    { order: 1, title: 'Great-Grandparent', symbol: '🌳', color: '#6b7280', description: 'Foundation of the family tree' },
    { order: 2, title: 'Grandparent',       symbol: '🌲', color: '#4b5563', description: 'Elder generation' },
    { order: 3, title: 'Parent',            symbol: '🌿', color: '#374151', description: 'Your parents\' generation' },
    { order: 4, title: 'Your Generation',   symbol: '🌱', color: '#16a34a', description: 'Siblings, cousins, spouse' },
    { order: 5, title: 'Children',          symbol: '🪴', color: '#22c55e', description: 'Next generation' },
    { order: 6, title: 'Grandchildren',     symbol: '🌾', color: '#4ade80', description: 'Future generation' },
  ],
};

// ── All systems registry ──────────────────────────────────────────────────────

export const HIERARCHY_SYSTEMS: Record<string, HierarchySystem> = {
  bjj:                 BJJ,
  judo:                JUDO,
  martial_arts_generic: MARTIAL_ARTS_GENERIC,
  military_enlisted:   MILITARY_ENLISTED,
  military_officer:    MILITARY_OFFICER,
  corporate:           CORPORATE,
  academic:            ACADEMIC,
  family_generational: FAMILY_GENERATIONAL,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

export function getSystemById(id: string): HierarchySystem | null {
  return HIERARCHY_SYSTEMS[id] ?? null;
}

export function getLevelByOrder(system: HierarchySystem, order: number) {
  return system.levels.find(l => l.order === order) ?? null;
}

export function inferSystemFromDomain(domain: string): HierarchySystem | null {
  if (domain === 'bjj' || domain === 'jiujitsu') return BJJ;
  if (domain === 'judo') return JUDO;
  if (domain.includes('martial') || domain.includes('karate') || domain.includes('mma')) return MARTIAL_ARTS_GENERIC;
  if (domain.includes('military') || domain.includes('army') || domain.includes('navy')) return MILITARY_ENLISTED;
  if (domain.includes('corporate') || domain.includes('company') || domain.includes('work')) return CORPORATE;
  if (domain.includes('academic') || domain.includes('university') || domain.includes('school')) return ACADEMIC;
  if (domain.includes('family')) return FAMILY_GENERATIONAL;
  return null;
}
