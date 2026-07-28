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
  source: 'conversation' | 'user_posted';
};

const AUDIENCE_CYCLE: Array<OrgDerivedEvent['audience']> = [
  'with_user',
  'without_user',
  'group_wide',
];

/** Target density so demo swimlanes read as a lived year, not three lonely pills. */
const MIN_DEMO_TIMELINE_EVENTS = 12;

function memberNames(org: Organization): string[] {
  return (org.members ?? []).map((m) => m.character_name).filter(Boolean);
}

function pickMembers(members: string[], count: number, offset = 0): string[] {
  if (members.length === 0) return [];
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(members[(offset + i) % members.length]!);
  }
  return [...new Set(out)];
}

type SeedSpec = {
  daysAgo: number;
  title: string;
  type: string;
  summary: string;
  audience: NonNullable<OrgDerivedEvent['audience']>;
  memberCount?: number;
  memberOffset?: number;
};

function isMartialArtsOrg(org: Organization): boolean {
  const name = org.name.toLowerCase();
  return (
    org.group_type === 'martial_arts' ||
    org.type === 'martial_arts' ||
    /\b(bjj|jiu[\s-]?jitsu|mma|dojo|gym)\b/i.test(name)
  );
}

function martialArtsSeeds(orgName: string, members: string[]): SeedSpec[] {
  const coach = members[0] ?? 'the coach';
  const partner = members[1] ?? members[0] ?? 'a training partner';
  const senior = members[2] ?? partner;
  return [
    {
      daysAgo: 340,
      title: `First drop-in at ${orgName}`,
      type: 'social',
      summary: `Signed the waiver, borrowed a gi that smelled like someone else’s laundry, and got smashed for an hour. Left sore, bruised, and weirdly excited to come back.`,
      audience: 'with_user',
      memberCount: 2,
    },
    {
      daysAgo: 300,
      title: 'Bought my first gi',
      type: 'other',
      summary: `White belt kit, a mouthguard, and a receipt that felt like a commitment. Felt official for about ten minutes — then the next class humbled you again.`,
      audience: 'with_user',
      memberCount: 1,
    },
    {
      daysAgo: 260,
      title: `${coach} ran a guard-passing clinic`,
      type: 'meeting',
      summary: `Half the room without you — ${senior} said it was the best technical class of the month. You caught the notes in the group chat and tried them that weekend.`,
      audience: 'without_user',
      memberCount: 2,
      memberOffset: 0,
    },
    {
      daysAgo: 220,
      title: 'Thursday fundamentals',
      type: 'other',
      summary: `Drilled hip escapes until your hips quit. ${partner} kept resetting you kindly, and for once the movement started to feel less like panic and more like a plan.`,
      audience: 'with_user',
      memberCount: 2,
      memberOffset: 1,
    },
    {
      daysAgo: 185,
      title: 'In-house positional sparring night',
      type: 'game',
      summary: `Whole gym stayed late. You sat out the last round but stuck around for the debrief — the kind of night where the mat talk outlasts the rolls.`,
      audience: 'group_wide',
      memberCount: 3,
    },
    {
      daysAgo: 150,
      title: `${partner} tapped a purple belt`,
      type: 'social',
      summary: `You heard about it in the locker room the next day — big energy without you on the mat. ${partner} tried to play it cool; nobody else did.`,
      audience: 'without_user',
      memberCount: 2,
      memberOffset: 1,
    },
    {
      daysAgo: 120,
      title: 'Competition team trip',
      type: 'other',
      summary: `${orgName} sent a small squad to a local open. You couldn’t go — followed results in the group chat and felt every match from the sidelines.`,
      audience: 'without_user',
      memberCount: 3,
    },
    {
      daysAgo: 95,
      title: 'Open mat with visitors',
      type: 'social',
      summary: `Two drop-ins from another academy. Rolled light, traded notes afterward, and left with one new grip detail you kept thinking about on the drive home.`,
      audience: 'with_user',
      memberCount: 3,
    },
    {
      daysAgo: 70,
      title: `${coach} promoted two blue belts`,
      type: 'meeting',
      summary: `Ceremony after class. You weren’t there — watched the story posts later and felt that odd mix of pride and FOMO that only gym families produce.`,
      audience: 'group_wide',
      memberCount: 2,
    },
    {
      daysAgo: 48,
      title: 'Recovery week / light drilling',
      type: 'other',
      summary: `Rib tweak. Showed up anyway, drilled closed guard entries with ${partner}, and left early before ego could talk you into rolling.`,
      audience: 'with_user',
      memberCount: 2,
      memberOffset: 1,
    },
    {
      daysAgo: 28,
      title: 'Seminar with a visiting black belt',
      type: 'meeting',
      summary: `Packed mats and a notebook full of half-legible arrows. You took notes; ${senior} asked the best questions and made the room feel smarter.`,
      audience: 'with_user',
      memberCount: 3,
    },
    {
      daysAgo: 18,
      title: 'Kids class ran late — adults waited',
      type: 'other',
      summary: `Adults hung in the lobby trading gossip and stretch tips. By the time night class started, half the warm-up had already happened in the hallway.`,
      audience: 'group_wide',
      memberCount: 2,
    },
    {
      daysAgo: 14,
      title: 'First stripe on my white belt',
      type: 'story',
      summary: `Six months of embarrassing yourself on the mat, then something finally clicked. ${coach} noticed before you did — that stripe felt louder than it looked.`,
      audience: 'with_user',
      memberCount: 2,
    },
    {
      daysAgo: 9,
      title: `${senior} taught a lunchtime open mat`,
      type: 'social',
      summary: `Daytime crew only — you were at work. Heard it was technical and quiet, the kind of session people protect because it actually teaches.`,
      audience: 'without_user',
      memberCount: 2,
      memberOffset: 2,
    },
    {
      daysAgo: 5,
      title: 'Saturday open mat',
      type: 'social',
      summary: `Long rolls, water breaks, and one round that finally felt like jiu-jitsu instead of survival. You walked out tired in the good way.`,
      audience: 'with_user',
      memberCount: 3,
    },
    {
      daysAgo: 3,
      title: 'Tuesday class',
      type: 'other',
      summary: `Passing from knees. ${partner} caught you in the same choke twice — useful humiliation, and a reminder to keep your elbows in.`,
      audience: 'with_user',
      memberCount: 2,
      memberOffset: 1,
    },
  ];
}

function genericSeeds(orgName: string, members: string[]): SeedSpec[] {
  const lead = members[0] ?? 'someone';
  const second = members[1] ?? lead;
  return [
    {
      daysAgo: 320,
      title: `First time ${orgName} came up in chat`,
      type: 'social',
      summary: `You mentioned ${orgName} while talking about your week — not as a big reveal, just as part of the story. Looking back, that was the first time the circle had a name in LoreBook.`,
      audience: 'with_user',
      memberCount: 2,
    },
    {
      daysAgo: 280,
      title: `${lead} introduced you around`,
      type: 'social',
      summary: `Awkward hellos, half-remembered names, then it started feeling like a real circle. ${lead} did the social work so you didn’t have to.`,
      audience: 'with_user',
      memberCount: 3,
    },
    {
      daysAgo: 240,
      title: `${second} handled something without you`,
      type: 'other',
      summary: `You heard about it later — the group moved while you were offline. Not drama, just the reminder that ${orgName} keeps going whether you’re in the thread or not.`,
      audience: 'without_user',
      memberCount: 2,
      memberOffset: 1,
    },
    {
      daysAgo: 200,
      title: `${orgName} planning thread`,
      type: 'meeting',
      summary: `Dates, logistics, and three competing restaurant opinions. The plan barely held, but the back-and-forth is half of what makes the group feel alive.`,
      audience: 'group_wide',
      memberCount: 3,
    },
    {
      daysAgo: 160,
      title: 'Quiet week — you missed the hang',
      type: 'social',
      summary: `They still met. Photos in the chat, inside jokes you had to ask about, and that slight lag of catching up after missing a night.`,
      audience: 'without_user',
      memberCount: 2,
    },
    {
      daysAgo: 130,
      title: `Milestone for ${orgName}`,
      type: 'social',
      summary: `A group-wide moment that rippled through a few people at once. Not everyone framed it the same way, but everyone felt the shift.`,
      audience: 'group_wide',
      memberCount: 3,
    },
    {
      daysAgo: 100,
      title: 'Catch-up coffee after the gap',
      type: 'social',
      summary: `You and ${lead} filled in what you’d both missed — the soft reset after a stretch of half-presence. Left feeling more in the loop than the week before.`,
      audience: 'with_user',
      memberCount: 1,
    },
    {
      daysAgo: 75,
      title: `${orgName} night out`,
      type: 'social',
      summary: `Loud room, late exit, and one story you’ll still be quoting. The whole circle stayed past last call; someone filmed the walk home and the group chat never recovered.`,
      audience: 'with_user',
      memberCount: 3,
    },
    {
      daysAgo: 55,
      title: `${second} organized without looping you in`,
      type: 'meeting',
      summary: `Not personal — just fast. You joined the next one and pretended you’d always been on the invite list.`,
      audience: 'without_user',
      memberCount: 2,
      memberOffset: 1,
    },
    {
      daysAgo: 40,
      title: 'Shared win in the group chat',
      type: 'other',
      summary: `Screenshots, congratulations, and a flood of reaction spam. For a minute ${orgName} felt like a scoreboard everyone was happy to watch.`,
      audience: 'group_wide',
      memberCount: 2,
    },
    {
      daysAgo: 22,
      title: `Regular hang with ${orgName}`,
      type: 'social',
      summary: `Same place, same energy — the kind of night that barely needs a title. You left early enough to sleep, late enough to feel like you’d been there.`,
      audience: 'with_user',
      memberCount: 3,
    },
    {
      daysAgo: 12,
      title: 'Side conversation you weren’t in',
      type: 'other',
      summary: `${lead} and ${second} sorted a logistics thing; you got the recap. Useful, slightly secondhand, and fine — not every thread needs your vote.`,
      audience: 'without_user',
      memberCount: 2,
    },
    {
      daysAgo: 6,
      title: `Check-in about ${orgName}`,
      type: 'meeting',
      summary: `How it’s going, who’s around, what might happen next month. Less gossip, more temperature check — the conversation that keeps a circle from drifting.`,
      audience: 'with_user',
      memberCount: 2,
    },
    {
      daysAgo: 2,
      title: 'Recent mention in chat',
      type: 'social',
      summary: `${orgName} came up again — a small update, still alive in the story. Nothing dramatic, just proof the thread hasn’t gone cold.`,
      audience: 'with_user',
      memberCount: 1,
    },
  ];
}

function seedsToEvents(
  org: Organization,
  members: string[],
  specs: SeedSpec[],
): OrgDerivedEvent[] {
  const now = new Date();
  return specs.map((spec, idx) => {
    const audience = spec.audience;
    const involved = pickMembers(
      members,
      spec.memberCount ?? 2,
      spec.memberOffset ?? idx,
    );
    return {
      id: `mock-seed-${org.id}-${idx}-${spec.daysAgo}`,
      title: spec.title,
      date: subDays(now, spec.daysAgo).toISOString(),
      type: spec.type,
      summary: spec.summary,
      involved,
      audience,
      user_was_present: audience === 'with_user',
      source: 'conversation' as const,
    };
  });
}

function enrichingSeeds(org: Organization, members: string[]): OrgDerivedEvent[] {
  const specs = isMartialArtsOrg(org)
    ? martialArtsSeeds(org.name, members)
    : genericSeeds(org.name, members);
  return seedsToEvents(org, members, specs);
}

function titleKey(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Fallback blurb when an org card event has a title but no summary. */
function summaryFromEventTitle(title: string, orgName: string): string {
  const clean = title.trim() || 'This moment';
  return `${clean} with ${orgName}. A lived beat in the group’s timeline — open chat if you want to fill in who was there and how it felt.`;
}

/** Demo-mode timeline events derived from mock organization card data. */
export function getMockOrganizationDerivedEvents(org: Organization): OrgDerivedEvent[] {
  const members = memberNames(org);
  const events: OrgDerivedEvent[] = [];
  const seen = new Set<string>();

  const push = (event: OrgDerivedEvent) => {
    const key = titleKey(event.title);
    if (seen.has(key)) return;
    seen.add(key);
    events.push(event);
  };

  (org.events ?? []).forEach((event, idx) => {
    const audience = AUDIENCE_CYCLE[idx % AUDIENCE_CYCLE.length];
    push({
      id: `mock-derived-event-${event.id}`,
      title: event.title,
      date: event.date,
      type: event.type,
      summary: summaryFromEventTitle(event.title, org.name),
      involved: pickMembers(members, Math.max(1, (idx % 3) + 1), idx),
      audience,
      user_was_present: audience === 'with_user',
      source: 'conversation',
    });
  });

  (org.stories ?? []).forEach((story, idx) => {
    push({
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

  // Always pad demo timelines so swimlanes look lived-in.
  if (events.length < MIN_DEMO_TIMELINE_EVENTS) {
    for (const seed of enrichingSeeds(org, members)) {
      if (events.length >= MIN_DEMO_TIMELINE_EVENTS + 4) break;
      push(seed);
    }
  }

  return events.sort((a, b) => {
    const ta = a.date ? new Date(a.date).getTime() : 0;
    const tb = b.date ? new Date(b.date).getTime() : 0;
    return ta - tb;
  });
}
