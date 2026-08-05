import { inferEdges } from '../components/family/FamilyTreeView';
import type { FamilyMember, FamilyTree } from '../types/socialRoles';
import { formatClipboardFields } from './listClipboard';
import { formatFamilyMemberDisplayName } from './familyMemberDisplay';

export type FamilyTreeClipboardOptions = {
  /** e.g. "Your family tree" or "Family tree — Marcus" */
  title?: string;
  /** Extra context lines (character id, scope, …). */
  filters?: string[];
};

const GENERATION_LABEL: Record<number, string> = {
  [-3]: 'Great-grandparents',
  [-2]: 'Grandparents',
  [-1]: 'Parents / aunts & uncles',
  0: 'Your generation',
  1: 'Children',
  2: 'Grandchildren',
  3: 'Great-grandchildren',
};

function generationLabel(gen: number): string {
  return GENERATION_LABEL[gen] ?? `Generation ${gen}`;
}

function memberDisplayName(m: FamilyMember): string {
  return formatFamilyMemberDisplayName(m);
}

function nameById(members: FamilyMember[]): Map<string, string> {
  return new Map(members.map((m) => [m.id, memberDisplayName(m)]));
}

function resolveParentsChildren(
  tree: FamilyTree,
): Map<string, { parents: string[]; children: string[] }> {
  const names = nameById(tree.members);
  const map = new Map<string, { parents: string[]; children: string[] }>();
  for (const m of tree.members) {
    map.set(m.id, { parents: [], children: [] });
  }

  const edges = inferEdges(tree.members);
  for (const { from, to } of edges) {
    const parentEntry = map.get(from);
    const childEntry = map.get(to);
    const parentName = names.get(from);
    const childName = names.get(to);
    if (parentEntry && childName && !parentEntry.children.includes(childName)) {
      parentEntry.children.push(childName);
    }
    if (childEntry && parentName && !childEntry.parents.includes(parentName)) {
      childEntry.parents.push(parentName);
    }
  }

  // Explicit parent_id may already be in edges; still surface raw id resolution.
  for (const m of tree.members) {
    if (!m.parent_id) continue;
    const parent = tree.members.find((p) => p.id === m.parent_id);
    if (!parent) continue;
    const entry = map.get(m.id);
    const parentName = memberDisplayName(parent);
    if (entry && !entry.parents.includes(parentName)) entry.parents.push(parentName);
    const parentEntry = map.get(parent.id);
    const childName = memberDisplayName(m);
    if (parentEntry && !parentEntry.children.includes(childName)) {
      parentEntry.children.push(childName);
    }
  }

  return map;
}

function siblingsOf(member: FamilyMember, tree: FamilyTree): string[] {
  const byParent = new Map<string, string[]>();
  for (const m of tree.members) {
    if (!m.parent_id) continue;
    const list = byParent.get(m.parent_id) ?? [];
    list.push(m.id);
    byParent.set(m.parent_id, list);
  }
  const sharedParentSiblings = new Set<string>();
  if (member.parent_id) {
    for (const id of byParent.get(member.parent_id) ?? []) {
      if (id !== member.id) sharedParentSiblings.add(id);
    }
  }
  const named = tree.members
    .filter((m) => {
      if (m.id === member.id || m.is_placeholder) return false;
      if (sharedParentSiblings.has(m.id)) return true;
      if (m.generation !== member.generation) return false;
      return (
        m.relation === 'sibling' ||
        m.relation === 'twin' ||
        m.relation === 'half_sibling' ||
        m.relation === 'step_sibling' ||
        /\b(brother|sister|sibling|hermano|hermana)\b/i.test(
          `${m.kinship_title ?? ''} ${m.relation_label ?? ''} ${m.name}`,
        )
      );
    })
    .map(memberDisplayName);

  return [...new Set(named)];
}

/**
 * Plain-text export of a family tree for compare/debug — includes every member’s
 * relationship fields plus resolved parents and children.
 */
export function buildFamilyTreeClipboardText(
  tree: FamilyTree | null | undefined,
  options?: FamilyTreeClipboardOptions,
): string {
  const title = options?.title?.trim() || 'Family tree';
  const members = tree?.members ?? [];
  const header = `${title} (${members.length} member${members.length === 1 ? '' : 's'})`;
  const filterLines = (options?.filters ?? []).map((f) => f.trim()).filter(Boolean);
  const filtersBlock = filterLines.length ? `\nFilters: ${filterLines.join('; ')}` : '';

  if (!tree || members.length === 0) {
    return `${header}${filtersBlock}\n\n(empty)`;
  }

  const links = resolveParentsChildren(tree);
  const self = members.find((m) => m.is_self);
  const branches =
    tree.branches?.length > 0
      ? tree.branches.map((b) => `${b.label} (${b.side})`).join(', ')
      : null;

  const summaryFields = formatClipboardFields([
    { label: 'Self', value: self ? memberDisplayName(self) : null },
    { label: 'Self id', value: tree.self_id || self?.id },
    { label: 'Branches', value: branches },
  ]);

  const sorted = [...members].sort((a, b) => {
    if (a.generation !== b.generation) return a.generation - b.generation;
    if (Boolean(a.is_self) !== Boolean(b.is_self)) return a.is_self ? -1 : 1;
    return memberDisplayName(a).localeCompare(memberDisplayName(b));
  });

  const blocks = sorted.map((m, index) => {
    const link = links.get(m.id) ?? { parents: [], children: [] };
    const sibs = siblingsOf(m, tree);
    const meta = formatClipboardFields([
      { label: 'Id', value: m.id },
      { label: 'First name', value: m.first_name },
      { label: 'Last name', value: m.last_name },
      { label: 'Kinship title', value: m.kinship_title },
      { label: 'Relation', value: m.relation },
      { label: 'Relation label', value: m.relation_label },
      { label: 'Generation', value: `${m.generation} (${generationLabel(m.generation)})` },
      { label: 'Side', value: m.side },
      { label: 'Is self', value: m.is_self },
      { label: 'Placeholder', value: m.is_placeholder },
      { label: 'Inference', value: m.inference_status },
      { label: 'Has card', value: m.has_card },
      { label: 'Explicit parent id', value: m.parent_id },
      { label: 'Parents', value: link.parents },
      { label: 'Children', value: link.children },
      { label: 'Siblings', value: sibs },
      { label: 'Birth year', value: m.birth_year },
      { label: 'Deceased', value: m.deceased },
      { label: 'Closeness', value: m.closeness },
      { label: 'Needs review', value: m.needs_review },
      { label: 'Review reason', value: m.review_reason },
      { label: 'Notes', value: m.notes },
    ]);

    return `${index + 1}. ${memberDisplayName(m)}${meta ? `\n${meta}` : ''}`;
  });

  // Parent→child edge dump for easy structural compare.
  const edges = inferEdges(members);
  const names = nameById(members);
  const edgeLines =
    edges.length === 0
      ? '(no parent→child edges inferred)'
      : edges
          .map((e) => `${names.get(e.from) ?? e.from} → ${names.get(e.to) ?? e.to}`)
          .join('\n');

  return [
    `${header}${filtersBlock}`,
    summaryFields || null,
    blocks.join('\n\n'),
    '--- Parent → child links ---',
    edgeLines,
  ]
    .filter(Boolean)
    .join('\n\n');
}
