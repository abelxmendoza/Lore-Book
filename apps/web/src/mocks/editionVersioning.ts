/**
 * Synthetic LoreBook edition lineage for demo mode.
 * Fixtures: Vanguard Robotics career arc + Jamie & Marcus relationships.
 * No founder PII — Marcus / Jamie / Vanguard / MemoVault only.
 */

import type { CompiledBookChapter, CompiledBookDraft, CompiledBookVersion, StoryDomain } from '../lib/storyForge/types';
import type { DemoCoreLorebookRecord, DemoEdition } from '../lib/storyForge/demoCoreLorebookStore';

function chapter(
  id: string,
  title: string,
  summary: string,
  domain: StoryDomain,
  atomIds: string[] = [`atom-${id}`],
): CompiledBookChapter {
  return { id, title, summary, domain, atomIds };
}

function versionMeta(
  version: number,
  compiledAt: string,
  atomCount: number,
  snapshotHash: string,
  sourceTurns: number,
): CompiledBookVersion {
  return {
    version,
    compiledAt,
    atomCount,
    entityCount: Math.max(2, Math.round(atomCount / 2)),
    connectionCount: Math.max(1, Math.round(atomCount / 3)),
    situationCount: Math.max(1, Math.round(atomCount / 4)),
    sourceTurns,
    snapshotHash,
  };
}

function book(
  id: string,
  title: string,
  subtitle: string,
  chapters: CompiledBookChapter[],
  latest: CompiledBookVersion,
): CompiledBookDraft {
  return {
    id,
    title,
    subtitle,
    chapters,
    versions: [latest],
    latestVersion: latest,
  };
}

const VANGUARD_V1_CHAPTERS: CompiledBookChapter[] = [
  chapter('vg-join', 'Joining Vanguard Robotics', 'Marcus accepted the offer and met Jamie on day one.', 'career'),
  chapter('vg-first-ship', 'First ship cycle', 'The MemoVault pilot scrambled the team schedule.', 'career'),
  chapter('vg-mentor', 'Learning the floor', 'Jamie walked Marcus through failure analysis rituals.', 'career'),
];

const VANGUARD_V2_CHAPTERS: CompiledBookChapter[] = [
  ...VANGUARD_V1_CHAPTERS.map((c) =>
    c.id === 'vg-first-ship'
      ? {
          ...c,
          summary:
            'The MemoVault pilot scrambled schedules — and taught Marcus how Vanguard recovers under pressure.',
        }
      : c,
  ),
  chapter('vg-promotion', 'Stretch assignment', 'Marcus led a cross-team review with Jamie as sponsor.', 'career'),
];

const VANGUARD_V3_CHAPTERS: CompiledBookChapter[] = [
  VANGUARD_V2_CHAPTERS[0],
  VANGUARD_V2_CHAPTERS[3], // reordered: promotion before ship cycle
  VANGUARD_V2_CHAPTERS[1],
  VANGUARD_V2_CHAPTERS[2],
  chapter('vg-memovault', 'MemoVault handoff', 'Marcus and Jamie closed the pilot with a written postmortem.', 'career'),
];

const RELATIONSHIPS_V1_CHAPTERS: CompiledBookChapter[] = [
  chapter('rel-meet', 'Meeting Jamie', 'Marcus met Jamie through the Vanguard interview loop.', 'relationships'),
  chapter('rel-trust', 'Building trust', 'Weekend debriefs turned into a steady friendship.', 'relationships'),
];

const RELATIONSHIPS_V2_CHAPTERS: CompiledBookChapter[] = [
  ...RELATIONSHIPS_V1_CHAPTERS,
  chapter(
    'rel-boundary',
    'Keeping work and friendship clear',
    'Marcus and Jamie agreed how to separate sponsorship from friendship.',
    'relationships',
  ),
];

function record(
  lorebookName: string,
  lorebookVersion: number,
  edition: DemoEdition,
  compiledBook: CompiledBookDraft,
  createdAt: string,
): DemoCoreLorebookRecord {
  return {
    id: `demo-core-${lorebookName.replace(/\s+/g, '-').toLowerCase()}-v${lorebookVersion}-${edition}`,
    lorebookName,
    lorebookVersion,
    edition,
    bookId: compiledBook.id,
    compiledBook,
    createdAt,
    snapshotHash: compiledBook.latestVersion.snapshotHash,
  };
}

/** Stable seed records for demo edition history / manifest / compare. */
export function buildDemoEditionFixtureRecords(): DemoCoreLorebookRecord[] {
  const v1Meta = versionMeta(1, '2026-03-01T16:00:00.000Z', 9, 'hash-vanguard-v1', 12);
  const v2Meta = versionMeta(2, '2026-05-12T18:30:00.000Z', 12, 'hash-vanguard-v2', 28);
  const v3Meta = versionMeta(3, '2026-07-20T14:15:00.000Z', 15, 'hash-vanguard-v3', 44);

  const vanguardV1 = book(
    'demo-vanguard-career-v1',
    'Career at Vanguard Robotics',
    'Early days on the floor',
    VANGUARD_V1_CHAPTERS,
    v1Meta,
  );
  const vanguardV2 = book(
    'demo-vanguard-career-v2',
    'Career at Vanguard Robotics',
    'Stretch work after MemoVault',
    VANGUARD_V2_CHAPTERS,
    v2Meta,
  );
  const vanguardV3 = book(
    'demo-vanguard-career-v3',
    'Career at Vanguard Robotics',
    'Pilot closed, lessons kept',
    VANGUARD_V3_CHAPTERS,
    v3Meta,
  );

  const relV1Meta = versionMeta(1, '2026-04-02T12:00:00.000Z', 6, 'hash-jamie-marcus-v1', 10);
  const relV2Meta = versionMeta(2, '2026-06-18T09:45:00.000Z', 9, 'hash-jamie-marcus-v2', 22);
  const relationshipsV1 = book(
    'demo-jamie-marcus-v1',
    'Relationships — Jamie & Marcus',
    'How the friendship started',
    RELATIONSHIPS_V1_CHAPTERS,
    relV1Meta,
  );
  const relationshipsV2 = book(
    'demo-jamie-marcus-v2',
    'Relationships — Jamie & Marcus',
    'Friendship with clear boundaries',
    RELATIONSHIPS_V2_CHAPTERS,
    relV2Meta,
  );

  return [
    record('Career at Vanguard Robotics', 1, 'main', vanguardV1, v1Meta.compiledAt),
    record('Career at Vanguard Robotics', 2, 'main', vanguardV2, v2Meta.compiledAt),
    record('Career at Vanguard Robotics', 3, 'main', vanguardV3, v3Meta.compiledAt),
    record('Relationships — Jamie & Marcus', 1, 'main', relationshipsV1, relV1Meta.compiledAt),
    record('Relationships — Jamie & Marcus', 2, 'main', relationshipsV2, relV2Meta.compiledAt),
  ];
}

export const DEMO_EDITION_PUBLICATION_HANDLES = [
  'Career at Vanguard Robotics',
  'Relationships — Jamie & Marcus',
] as const;
