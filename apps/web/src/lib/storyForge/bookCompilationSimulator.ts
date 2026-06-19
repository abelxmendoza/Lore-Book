import type {
  CompiledBookChapter,
  CompiledBookDraft,
  CompiledBookVersion,
  StoryDomain,
  StoryMemoryState,
} from './types';

const DOMAIN_CHAPTER_TITLES: Record<StoryDomain, string> = {
  relationships: 'People & bonds',
  romance: 'Love & intimacy',
  family: 'Family & lineage',
  career: 'Work & ambition',
  health: 'Body & rhythm',
  creative: 'Making things',
  social: 'Community & crews',
  place: 'Places that hold you',
  identity: 'Who you are becoming',
};

function hashSnapshot(state: StoryMemoryState): string {
  const payload = JSON.stringify({
    turns: state.turnsProcessed,
    entities: Object.keys(state.entities).sort(),
    atoms: state.atoms.length,
    situations: state.situations.map((s) => s.tag).sort(),
  });
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    hash = (hash << 5) - hash + payload.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36).slice(0, 8);
}

function buildChapters(state: StoryMemoryState): CompiledBookChapter[] {
  const byDomain = new Map<StoryDomain, string[]>();

  for (const atom of state.atoms) {
    for (const domain of atom.domains) {
      const list = byDomain.get(domain) ?? [];
      list.push(atom.id);
      byDomain.set(domain, list);
    }
  }

  const chapters: CompiledBookChapter[] = [];
  for (const [domain, atomIds] of byDomain.entries()) {
    if (atomIds.length === 0) continue;
    const atoms = state.atoms.filter((a) => atomIds.includes(a.id));
    const entityNames = [
      ...new Set(
        atoms.flatMap((a) => a.entityIds.map((id) => state.entities[id]?.name).filter(Boolean) as string[])
      ),
    ];
    chapters.push({
      id: `ch-${domain}`,
      title: DOMAIN_CHAPTER_TITLES[domain],
      summary:
        entityNames.length > 0
          ? `Woven from ${atoms.length} moment${atoms.length === 1 ? '' : 's'} involving ${entityNames.slice(0, 4).join(', ')}.`
          : `${atoms.length} narrative moment${atoms.length === 1 ? '' : 's'} in your ${domain} thread.`,
      atomIds,
      domain,
    });
  }

  return chapters.sort((a, b) => b.atomIds.length - a.atomIds.length);
}

export function compileBookFromMemory(
  state: StoryMemoryState,
  options?: { title?: string; previousVersions?: CompiledBookVersion[] }
): CompiledBookDraft {
  const chapters = buildChapters(state);
  const snapshotHash = hashSnapshot(state);
  const prev = options?.previousVersions ?? [];

  const sameHash = prev.find((v) => v.snapshotHash === snapshotHash);
  const versionNumber = sameHash ? sameHash.version : prev.length + 1;

  const latestVersion: CompiledBookVersion = {
    version: versionNumber,
    compiledAt: new Date().toISOString(),
    atomCount: state.atoms.length,
    entityCount: Object.keys(state.entities).length,
    connectionCount: state.connections.length,
    situationCount: state.situations.length,
    sourceTurns: state.turnsProcessed,
    snapshotHash,
  };

  const versions = sameHash ? prev : [...prev, latestVersion];

  const title =
    options?.title ??
    (state.scenarioId
      ? `Living Lore — ${state.scenarioId.replace(/-/g, ' ')}`
      : 'Living Lore — compiled from chat');

  return {
    id: `book-${snapshotHash}`,
    title,
    subtitle: `${latestVersion.entityCount} people & places · ${latestVersion.situationCount} situations · v${latestVersion.version}`,
    chapters,
    versions,
    latestVersion,
  };
}

export function compileAllDomainBooks(state: StoryMemoryState): CompiledBookDraft[] {
  const full = compileBookFromMemory(state, { title: 'Main Life Story' });
  const books = [full];

  for (const chapter of full.chapters) {
    if (chapter.atomIds.length < 2) continue;
    const slice: StoryMemoryState = {
      ...state,
      atoms: state.atoms.filter((a) => chapter.atomIds.includes(a.id)),
      situations: state.situations.filter((s) => s.domain === chapter.domain),
    };
    books.push(
      compileBookFromMemory(slice, {
        title: chapter.title,
        previousVersions: [],
      })
    );
  }

  return books;
}
