import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { FamilyMember, FamilyTree } from '../../types/socialRoles';

type Props = {
  tree: FamilyTree;
  onMemberClick?: (member: FamilyMember) => void;
};

type TreeNode = {
  member: FamilyMember;
  children: TreeNode[];
};

const GROUP_ORDER: Array<{ key: string; label: string; relations: string[] }> = [
  { key: 'parents', label: 'Parents', relations: ['parent', 'step_parent'] },
  { key: 'grandparents', label: 'Grandparents', relations: ['grandparent'] },
  { key: 'aunts_uncles', label: 'Aunts & Uncles', relations: ['aunt', 'uncle'] },
  { key: 'siblings', label: 'Siblings', relations: ['sibling', 'twin', 'half_sibling', 'step_sibling'] },
  { key: 'cousins', label: 'Cousins', relations: ['cousin'] },
  { key: 'children', label: 'Children', relations: ['child', 'step_child', 'grandchild'] },
  { key: 'other', label: 'Other relatives', relations: ['related', 'spouse', 'in_law'] },
];

function buildGroupedTree(tree: FamilyTree): TreeNode {
  const self = tree.members.find((m) => m.is_self) ?? tree.members[0];
  const children: TreeNode[] = [];

  for (const group of GROUP_ORDER) {
    const members = tree.members.filter(
      (m) => !m.is_self && !m.is_placeholder && group.relations.includes(m.relation)
    );
    if (!members.length) continue;
    children.push({
      member: {
        id: `group-${group.key}`,
        name: group.label,
        relation: 'related',
        relation_label: group.label,
        generation: 0,
        is_placeholder: true,
      } as FamilyMember,
      children: members.map((m) => ({ member: m, children: [] })),
    });
  }

  return { member: self, children };
}

function ConfidenceBadge({ member }: { member: FamilyMember }) {
  const conf =
    member.inference_status === 'asserted' ? 0.94 : member.inference_status === 'inferred' ? 0.82 : 0.55;
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/50">
      {Math.round(conf * 100)}%
    </span>
  );
}

function TreeBranch({
  node,
  depth = 0,
  onMemberClick,
}: {
  node: TreeNode;
  depth?: number;
  onMemberClick?: (member: FamilyMember) => void;
}) {
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = node.children.length > 0;
  const isGroup = node.member.id.startsWith('group-');
  const isPlaceholder = node.member.is_placeholder && !isGroup;

  if (isPlaceholder && !isGroup) return null;

  return (
    <div className="select-none">
      <div
        className={`flex items-center gap-2 py-1.5 ${depth > 0 ? 'ml-4 border-l border-white/10 pl-3' : ''}`}
        style={{ marginLeft: depth * 12 }}
      >
        {hasChildren ? (
          <button type="button" onClick={() => setOpen(!open)} className="text-white/40 hover:text-white/70">
            {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <span className="w-3.5" />
        )}
        <button
          type="button"
          disabled={isGroup || node.member.is_self}
          onClick={() => !isGroup && !node.member.is_self && onMemberClick?.(node.member)}
          className={`flex items-center gap-2 text-left ${isGroup ? 'text-white/45 text-xs uppercase tracking-wide' : 'text-white/90 hover:text-purple-200'} ${node.member.is_self ? 'font-semibold text-purple-200' : ''}`}
        >
          <span>{node.member.kinship_title ?? node.member.name}</span>
          {node.member.kinship_title && node.member.name.toLowerCase() !== node.member.kinship_title.toLowerCase() && (
            <span className="text-white/40 text-xs">({node.member.name})</span>
          )}
          {!isGroup && !node.member.is_self && <ConfidenceBadge member={node.member} />}
        </button>
      </div>
      {open &&
        hasChildren &&
        node.children.map((child) => (
          <TreeBranch key={child.member.id} node={child} depth={depth + 1} onMemberClick={onMemberClick} />
        ))}
    </div>
  );
}

export function HierarchicalFamilyTree({ tree, onMemberClick }: Props) {
  const root = useMemo(() => buildGroupedTree(tree), [tree]);
  if (!tree.members.length) return null;

  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-4 font-mono text-sm">
      <TreeBranch node={root} onMemberClick={onMemberClick} />
    </div>
  );
}
