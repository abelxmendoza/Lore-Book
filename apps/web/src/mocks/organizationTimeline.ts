import { subDays } from 'date-fns';
import type { Organization } from '../components/organizations/OrganizationProfileCard';

export type OrgDerivedEvent = {
  id: string;
  title: string;
  date: string | null;
  type: string;
  summary?: string;
  involved: string[];
  user_was_present?: boolean;
  audience?: 'with_user' | 'without_user' | 'group_wide';
  scope?: 'direct' | 'subgroup' | 'hierarchy';
  subgroup_names?: string[];
  source: 'conversation';
};

const AUDIENCE_CYCLE: Array<OrgDerivedEvent['audience']> = [
  'with_user',
  'without_user',
  'group_wide',
];

function memberNames(org: Organization): string[] {
  return (org.members ?? []).map(m => m.character_name).filter(Boolean);
}

function fallbackEvents(org: Organization, members: string[]): OrgDerivedEvent[] {
  const now = new Date();
  const involved = members.slice(0, 3);
  const name = org.name;

  return [
    {
      id: `mock-fallback-1-${org.id}`,
      title: `First time ${name} came up in chat`,
      date: subDays(now, 180).toISOString(),
      type: 'social',
      summary: `You mentioned ${name} while talking about your week.`,
      involved,
      audience: 'with_user',
      user_was_present: true,
      source: 'conversation',
    },
    {
      id: `mock-fallback-2-${org.id}`,
      title: `${members[0] ?? 'A member'} handled something without you`,
      date: subDays(now, 90).toISOString(),
      type: 'other',
      summary: `Something happened within ${name} that you heard about later.`,
      involved: involved.slice(0, 2),
      audience: 'without_user',
      source: 'conversation',
    },
    {
      id: `mock-fallback-3-${org.id}`,
      title: `${name} milestone`,
      date: subDays(now, 45).toISOString(),
      type: 'social',
      summary: `A group-wide moment that affected multiple members of ${name}.`,
      involved,
      audience: 'group_wide',
      source: 'conversation',
    },
  ];
}

/** Demo-mode timeline events derived from mock organization card data. */
export function getMockOrganizationDerivedEvents(org: Organization): OrgDerivedEvent[] {
  const members = memberNames(org);
  const events: OrgDerivedEvent[] = [];

  (org.events ?? []).forEach((event, idx) => {
    const audience = AUDIENCE_CYCLE[idx % AUDIENCE_CYCLE.length];
    events.push({
      id: `mock-derived-event-${event.id}`,
      title: event.title,
      date: event.date,
      type: event.type,
      involved: members.slice(0, Math.max(1, (idx % 3) + 1)),
      audience,
      user_was_present: audience === 'with_user',
      source: 'conversation',
    });
  });

  (org.stories ?? []).forEach((story, idx) => {
    events.push({
      id: `mock-derived-story-${story.id}`,
      title: story.title,
      date: story.date,
      type: 'story',
      summary: story.summary,
      involved: members,
      audience: idx % 2 === 0 ? 'group_wide' : 'with_user',
      user_was_present: idx % 2 !== 0,
      source: 'conversation',
    });
  });

  if (events.length < 3) {
    events.push(...fallbackEvents(org, members));
  }

  return events.sort((a, b) => {
    const ta = a.date ? new Date(a.date).getTime() : 0;
    const tb = b.date ? new Date(b.date).getTime() : 0;
    return ta - tb;
  });
}
