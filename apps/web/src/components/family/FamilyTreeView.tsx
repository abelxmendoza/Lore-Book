import { useRef, useEffect, useState, useCallback, type MouseEvent as ReactMouseEvent } from 'react';
import {
  Heart,
  User,
  MoreVertical,
  AlertTriangle,
  Pencil,
  UserMinus,
  Trash2,
  Check,
  Building2,
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Link2,
  X,
} from 'lucide-react';
import { CharacterAvatar } from '../characters/CharacterAvatar';
import type { FamilyMember, FamilyTree } from '../../types/socialRoles';
import { useIsMobile } from '../../hooks/useIsMobile';
import {
  formatFamilyMemberDisplayName,
  formatFamilyMemberSubtitle,
} from '../../lib/familyMemberDisplay';

interface FamilyTreeViewProps {
  tree: FamilyTree;
  onMemberClick?: (member: FamilyMember) => void;
  compact?: boolean;
  /** Correct how a member relates (opens the relationship editor). */
  onEditRelationship?: (member: FamilyMember) => void;
  /** Remove from the tree but keep the character. */
  onExclude?: (member: FamilyMember) => void;
  /** Move a mis-filed collective / non-kin into Groups & Organizations. */
  onMoveToGroup?: (member: FamilyMember) => void;
  /** Delete the character entirely — it shouldn't be a character. */
  onDelete?: (member: FamilyMember) => void;
  /** Confirm a flagged member is really family (clears the review flag). */
  onKeep?: (member: FamilyMember) => void;
  /** Persist a drag-to-reorder within one generation row — every id in
   *  `orderedIds` gets sequential placement, left to right. Presence of this
   *  prop is what surfaces the Reorder toggle at all. */
  onReorderRow?: (orderedIds: string[]) => Promise<void> | void;
  /** Create a connection between two members by drag (desktop) or tap-tap
   *  (mobile): `fromId` is who the user started the gesture on, `toId` is who
   *  they dropped/tapped on. Presence of this prop is what surfaces the
   *  Connect toggle at all. */
  onConnectMembers?: (from: FamilyMember, to: FamilyMember, kind: 'parent' | 'spouse') => Promise<void> | void;
  /** Remove a member's connector line entirely (click-a-line to disconnect). */
  onDisconnectParent?: (member: FamilyMember) => Promise<void> | void;
}

type RelationStyle = {
  node: string;
  shadow: string;
  swatch: string;
  badge: string;
  label: string;
};

const RELATION_STYLES: Record<string, RelationStyle> = {
  parent: {
    node: 'border-[3px] border-violet-400 bg-violet-500/30',
    shadow: 'shadow-[0_0_12px_rgba(167,139,250,0.55)]',
    swatch: 'bg-violet-400 border-violet-200',
    badge: 'bg-violet-500/30 border-violet-300/80 text-violet-100',
    label: 'Parent',
  },
  grandparent: {
    node: 'border-[3px] border-purple-400 bg-purple-500/30',
    shadow: 'shadow-[0_0_12px_rgba(192,132,252,0.5)]',
    swatch: 'bg-purple-400 border-purple-200',
    badge: 'bg-purple-500/30 border-purple-300/80 text-purple-100',
    label: 'Grandparent',
  },
  sibling: {
    node: 'border-[3px] border-cyan-400 bg-cyan-500/30',
    shadow: 'shadow-[0_0_12px_rgba(34,211,238,0.5)]',
    swatch: 'bg-cyan-400 border-cyan-200',
    badge: 'bg-cyan-500/30 border-cyan-300/80 text-cyan-100',
    label: 'Sibling',
  },
  twin: {
    node: 'border-[3px] border-cyan-400 bg-cyan-500/30',
    shadow: 'shadow-[0_0_12px_rgba(34,211,238,0.5)]',
    swatch: 'bg-cyan-400 border-cyan-200',
    badge: 'bg-cyan-500/30 border-cyan-300/80 text-cyan-100',
    label: 'Twin',
  },
  half_sibling: {
    node: 'border-[3px] border-sky-400 bg-sky-500/25',
    shadow: 'shadow-[0_0_10px_rgba(56,189,248,0.45)]',
    swatch: 'bg-sky-400 border-sky-200',
    badge: 'bg-sky-500/30 border-sky-300/80 text-sky-100',
    label: 'Half-sibling',
  },
  step_sibling: {
    node: 'border-[3px] border-cyan-300 bg-cyan-500/20',
    shadow: 'shadow-[0_0_10px_rgba(103,232,249,0.4)]',
    swatch: 'bg-cyan-300 border-cyan-100',
    badge: 'bg-cyan-500/25 border-cyan-200/80 text-cyan-100',
    label: 'Step-sibling',
  },
  cousin: {
    node: 'border-[3px] border-teal-400 bg-teal-500/30',
    shadow: 'shadow-[0_0_12px_rgba(45,212,191,0.5)]',
    swatch: 'bg-teal-400 border-teal-200',
    badge: 'bg-teal-500/30 border-teal-300/80 text-teal-100',
    label: 'Cousin',
  },
  spouse: {
    node: 'border-[3px] border-rose-400 bg-rose-500/30',
    shadow: 'shadow-[0_0_12px_rgba(251,113,133,0.55)]',
    swatch: 'bg-rose-400 border-rose-200',
    badge: 'bg-rose-500/30 border-rose-300/80 text-rose-100',
    label: 'Partner',
  },
  child: {
    node: 'border-[3px] border-emerald-400 bg-emerald-500/30',
    shadow: 'shadow-[0_0_12px_rgba(52,211,153,0.5)]',
    swatch: 'bg-emerald-400 border-emerald-200',
    badge: 'bg-emerald-500/30 border-emerald-300/80 text-emerald-100',
    label: 'Child',
  },
  grandchild: {
    node: 'border-[3px] border-green-400 bg-green-500/30',
    shadow: 'shadow-[0_0_12px_rgba(74,222,128,0.5)]',
    swatch: 'bg-green-400 border-green-200',
    badge: 'bg-green-500/30 border-green-300/80 text-green-100',
    label: 'Grandchild',
  },
  aunt: {
    node: 'border-[3px] border-amber-400 bg-amber-500/30',
    shadow: 'shadow-[0_0_12px_rgba(251,191,36,0.5)]',
    swatch: 'bg-amber-400 border-amber-200',
    badge: 'bg-amber-500/30 border-amber-300/80 text-amber-100',
    label: 'Aunt',
  },
  uncle: {
    node: 'border-[3px] border-amber-400 bg-amber-500/30',
    shadow: 'shadow-[0_0_12px_rgba(251,191,36,0.5)]',
    swatch: 'bg-amber-400 border-amber-200',
    badge: 'bg-amber-500/30 border-amber-300/80 text-amber-100',
    label: 'Uncle',
  },
  in_law: {
    node: 'border-[3px] border-orange-400 bg-orange-500/30',
    shadow: 'shadow-[0_0_12px_rgba(251,146,60,0.5)]',
    swatch: 'bg-orange-400 border-orange-200',
    badge: 'bg-orange-500/30 border-orange-300/80 text-orange-100',
    label: 'In-law',
  },
  step_parent: {
    node: 'border-[3px] border-violet-300 bg-violet-500/20',
    shadow: 'shadow-[0_0_10px_rgba(196,181,253,0.4)]',
    swatch: 'bg-violet-300 border-violet-100',
    badge: 'bg-violet-500/25 border-violet-200/80 text-violet-100',
    label: 'Step-parent',
  },
  default: {
    node: 'border-[3px] border-white/40 bg-white/10',
    shadow: 'shadow-[0_0_8px_rgba(255,255,255,0.15)]',
    swatch: 'bg-white/50 border-white/70',
    badge: 'bg-white/10 border-white/40 text-white/80',
    label: 'Relative',
  },
};

const LEGEND_GROUPS: Array<{ keys: string[]; label: string }> = [
  { keys: ['parent', 'grandparent', 'step_parent'], label: 'Parents & grandparents' },
  { keys: ['sibling', 'twin', 'half_sibling', 'step_sibling'], label: 'Siblings' },
  { keys: ['spouse', 'in_law'], label: 'Partner & in-laws' },
  { keys: ['cousin'], label: 'Cousins' },
  { keys: ['aunt', 'uncle'], label: 'Aunts & uncles' },
  { keys: ['child', 'grandchild'], label: 'Children & grandchildren' },
];

function relationStyle(relation: string): RelationStyle {
  return RELATION_STYLES[relation] ?? RELATION_STYLES.default;
}

const SIDE_ACCENT: Record<string, string> = {
  maternal: 'ring-2 ring-rose-400/80 ring-offset-1 ring-offset-black/80',
  paternal: 'ring-2 ring-blue-400/80 ring-offset-1 ring-offset-black/80',
  partner:  'ring-2 ring-emerald-400/80 ring-offset-1 ring-offset-black/80',
  other:    'ring-2 ring-amber-300/60 ring-offset-1 ring-offset-black/80',
};

const closenessRing = (closeness?: number) => {
  if (!closeness) return '';
  if (closeness >= 80) return 'ring-2 ring-purple-400/70 shadow-[0_0_8px_rgba(168,85,247,0.5)]';
  if (closeness >= 60) return 'ring-2 ring-cyan-400/50';
  if (closeness >= 40) return 'ring-1 ring-white/25';
  return '';
};

// ── Edge inference ─────────────────────────────────────────────────────────────
// Derives logical parent→child pairs from generation + side + relation fields.

export function inferEdges(members: FamilyMember[]): Array<{ from: string; to: string }> {
  const edges: Array<{ from: string; to: string }> = [];

  // User-asserted parent links win over inference: collect them up front and,
  // at the end, replace any inferred connector for those children.
  const memberIds = new Set(members.map(m => m.id));
  const explicitEdges = members
    .filter(m => m.parent_id && m.parent_id !== m.id && memberIds.has(m.parent_id))
    .map(m => ({ from: m.parent_id as string, to: m.id }));
  const pinnedChildren = new Set(explicitEdges.map(e => e.to));

  const byGen = new Map<number, FamilyMember[]>();
  for (const m of members) {
    if (!byGen.has(m.generation)) byGen.set(m.generation, []);
    byGen.get(m.generation)!.push(m);
  }

  const self    = members.find(m => m.is_self);
  const gen0    = byGen.get(0)  ?? [];
  const parents = byGen.get(-1) ?? [];
  const grandparents  = byGen.get(-2) ?? [];
  const greatGps      = byGen.get(-3) ?? [];
  const children      = byGen.get(1)  ?? [];
  const grandchildren = byGen.get(2)  ?? [];

  // Great-grandparents → Grandparents (side match)
  for (const ggp of greatGps) {
    const gp = grandparents.find(g => g.side && ggp.side && g.side === ggp.side);
    if (gp) edges.push({ from: ggp.id, to: gp.id });
  }

  // Grandparents → Parents (side match)
  for (const gp of grandparents) {
    const parent = parents.find(
      p => (p.relation === 'parent' || p.relation === 'step_parent') && p.side === gp.side,
    );
    if (parent) edges.push({ from: gp.id, to: parent.id });

    for (const auntUncle of parents.filter(p => (p.relation === 'aunt' || p.relation === 'uncle') && p.side === gp.side)) {
      edges.push({ from: gp.id, to: auntUncle.id });
    }
  }

  // Parents / Aunts-Uncles → Gen-0 members
  for (const member of gen0) {
    // Skip partners — no parent-child line for spouses
    if (member.relation === 'spouse' || member.relation === 'in_law') continue;

    if (member.is_self) {
      for (const p of parents) {
        if (p.relation === 'parent' || p.relation === 'step_parent') {
          edges.push({ from: p.id, to: member.id });
        }
      }
    } else if (member.relation === 'sibling' || member.relation === 'twin') {
      for (const p of parents) {
        if (p.relation === 'parent') edges.push({ from: p.id, to: member.id });
      }
    } else if (member.relation === 'half_sibling' || member.relation === 'step_sibling') {
      const shared = parents.find(
        p => p.side === member.side && (p.relation === 'parent' || p.relation === 'step_parent'),
      );
      if (shared) edges.push({ from: shared.id, to: member.id });
    } else if (member.relation === 'cousin') {
      const aunt =
        parents.find(
          p =>
            (p.relation === 'aunt' || p.relation === 'uncle') &&
            p.side &&
            member.side &&
            p.side === member.side,
        ) ??
        // Aunt/uncle often land in side "other" while cousins are maternal —
        // still connect when there's only one matching-generation aunt/uncle
        // or the child's explicit parent_id already points at them.
        parents.find(
          p =>
            (p.relation === 'aunt' || p.relation === 'uncle') &&
            (!p.side || p.side === 'other' || !member.side || member.side === 'other'),
        );
      if (aunt) edges.push({ from: aunt.id, to: member.id });
    } else if (member.relation !== 'related') {
      // Generic fallback: match by side
      const sideParent = parents.find(p => p.side && member.side && p.side === member.side);
      if (sideParent) edges.push({ from: sideParent.id, to: member.id });
    }
  }

  // Self → actual children. A niece/nephew may also be one generation below
  // the selected ego, but that must not be drawn as a parent→child edge.
  if (self) {
    for (const child of children) {
      if (
        child.relation === 'child' ||
        child.relation === 'step_child' ||
        child.relation === 'adopted_child' ||
        child.relation === 'godchild'
      ) {
        edges.push({ from: self.id, to: child.id });
      }
    }
  }

  // Self's spouse → step-children. "step_child" already means "not self's
  // biological/legal child" — which, in a two-parent household, points at
  // the spouse being the child's actual parent. Not every married pair
  // shares every child (blended families), so this must not be inferred
  // for a plain "child" relation (self's own — the spouse may or may not
  // co-parent them, and there's no signal either way): only step_child
  // gives an explicit, evidenced connection to draw.
  const selfSpouse = gen0.find((m) => m.relation === 'spouse');
  if (selfSpouse) {
    for (const child of children) {
      if (child.relation === 'step_child') {
        edges.push({ from: selfSpouse.id, to: child.id });
      }
    }
  }

  // Children → Grandchildren (side match)
  for (const child of children.filter(
    (m) =>
      m.relation === 'child' ||
      m.relation === 'step_child' ||
      m.relation === 'adopted_child',
  )) {
    for (const gc of grandchildren) {
      if (gc.relation !== 'grandchild') continue;
      if (gc.side && child.side && gc.side === child.side) {
        edges.push({ from: child.id, to: gc.id });
      }
    }
  }

  // Drop inferred connectors for any child the user explicitly re-parented,
  // then add the explicit links.
  const reconciled = edges.filter(e => !pinnedChildren.has(e.to));
  reconciled.push(...explicitEdges);

  // A member who explicitly disconnected their parent connector (click a
  // line -> disconnect) gets none at all, even one this function would
  // otherwise have inferred fresh next render. Checked last so it wins over
  // every rule above, including the explicit-parent_id path.
  const disconnectedIds = new Set(members.filter((m) => m.disconnected_parent).map((m) => m.id));
  if (disconnectedIds.size === 0) return reconciled;
  return reconciled.filter((e) => !disconnectedIds.has(e.to));
}

// ── PersonNode ─────────────────────────────────────────────────────────────────

const PersonNode = ({
  member,
  onClick,
  compact,
  onNodeRef,
}: {
  member: FamilyMember;
  onClick?: (m: FamilyMember) => void;
  compact?: boolean;
  onNodeRef?: (id: string, el: HTMLButtonElement | null) => void;
}) => {
  const style = relationStyle(member.relation);
  const borderCls = member.is_self
    ? 'border-[3px] border-primary bg-primary/15 shadow-[0_0_14px_rgba(124,58,237,0.55)]'
    : member.is_account_self
      ? 'border-[3px] border-amber-400/80 bg-amber-500/15 shadow-[0_0_12px_rgba(251,191,36,0.35)]'
    : member.is_placeholder
      ? 'border-[3px] border-dashed border-white/40 bg-white/[0.06]'
      : `${style.node} ${style.shadow}`;
  const sideCls = member.side ? SIDE_ACCENT[member.side] ?? '' : '';
  const closenessCls = closenessRing(member.closeness);
  const displayName = formatFamilyMemberDisplayName(member);
  const subtitle = formatFamilyMemberSubtitle(member);

  return (
    <button
      type="button"
      ref={el => onNodeRef?.(member.id, el)}
      onClick={() => !member.is_placeholder && onClick?.(member)}
      disabled={member.is_placeholder}
      className={`flex flex-col items-center gap-1 group ${onClick && !member.is_placeholder ? 'cursor-pointer' : 'cursor-default'} ${member.is_placeholder ? 'opacity-70' : ''}`}
      title={`${displayName} — ${member.relation_label}${member.is_account_self && !member.is_self ? ' (you)' : ''}`}
    >
      <div className={`rounded-full ${borderCls} ${sideCls} ${closenessCls} overflow-hidden flex items-center justify-center transition-transform group-hover:scale-105 ${compact ? 'w-10 h-10' : 'w-12 h-12 sm:w-14 sm:h-14'}`}>
        {member.is_self || member.is_account_self ? (
          <User className={`${compact ? 'h-5 w-5' : 'h-6 w-6'} ${member.is_self ? 'text-primary' : 'text-amber-300'}`} />
        ) : member.is_placeholder ? (
          <User className={`${compact ? 'h-4 w-4' : 'h-5 w-5'} text-white/35`} />
        ) : (
          <CharacterAvatar
            url={member.avatar_url}
            characterId={member.id}
            name={member.name}
            size={compact ? 40 : 56}
            className="w-full h-full border-0"
          />
        )}
      </div>
      <div className="text-center max-w-[96px]">
        <p className={`font-medium text-white/90 leading-tight line-clamp-2 ${compact ? 'text-[9px]' : 'text-[10px] sm:text-xs'}`}>
          {displayName}
        </p>
        {subtitle && (
          <p className={`text-white/40 leading-tight line-clamp-2 ${compact ? 'text-[8px]' : 'text-[9px]'}`}>
            {subtitle}
          </p>
        )}
        {member.is_account_self && !member.is_self && !compact && (
          <span className="inline-block mt-0.5 px-1.5 py-px rounded-full text-[8px] font-semibold uppercase tracking-wide border bg-amber-500/25 border-amber-300/70 text-amber-100">
            You
          </span>
        )}
        {!member.is_self && !member.is_account_self && !member.is_placeholder && !compact && (
          <span className={`inline-block mt-0.5 px-1.5 py-px rounded-full text-[8px] font-semibold uppercase tracking-wide border ${style.badge}`}>
            {style.label}
          </span>
        )}
        {member.deceased && <p className="text-[8px] text-white/25 italic">†</p>}
      </div>
    </button>
  );
};

// ── Node + edit affordances ─────────────────────────────────────────────────────

const NodeWithActions = ({
  member,
  onClick,
  compact,
  onNodeRef,
  onEditRelationship,
  onExclude,
  onMoveToGroup,
  onDelete,
  onKeep,
}: {
  member: FamilyMember;
  onClick?: (m: FamilyMember) => void;
  compact?: boolean;
  onNodeRef?: (id: string, el: HTMLButtonElement | null) => void;
  onEditRelationship?: (m: FamilyMember) => void;
  onExclude?: (m: FamilyMember) => void;
  onMoveToGroup?: (m: FamilyMember) => void;
  onDelete?: (m: FamilyMember) => void;
  onKeep?: (m: FamilyMember) => void;
}) => {
  const [open, setOpen] = useState(false);
  const editable =
    !member.is_self &&
    !member.is_placeholder &&
    Boolean(onEditRelationship || onExclude || onMoveToGroup || onDelete);
  const flagged =
    Boolean(member.needs_review) &&
    !member.is_self &&
    !member.is_account_self &&
    !member.is_placeholder;

  return (
    <div className="group/node relative flex flex-col items-center">
      <PersonNode member={member} onClick={onClick} compact={compact} onNodeRef={onNodeRef} />

      {flagged && (
        <span
          title={member.review_reason ?? 'This node may not belong in your family tree.'}
          aria-label="Needs review"
          data-testid={`review-flag-${member.id}`}
          className="absolute -top-1 right-0 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500/90 text-black shadow"
        >
          <AlertTriangle className="h-2.5 w-2.5" />
        </span>
      )}

      {editable && (
        <button
          type="button"
          aria-label={`Edit ${member.name}`}
          data-testid={`node-menu-${member.id}`}
          onClick={() => setOpen((o) => !o)}
          className="absolute -top-1 -left-1 flex h-5 w-5 items-center justify-center rounded-full border border-white/20 bg-black/70 text-white/70 opacity-0 transition group-hover/node:opacity-100 hover:text-white focus:opacity-100"
        >
          <MoreVertical className="h-3 w-3" />
        </button>
      )}

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div
            role="menu"
            className="absolute left-0 top-7 z-50 w-52 overflow-hidden rounded-lg border border-white/15 bg-[#15131f] py-1 text-left shadow-xl"
          >
            {flagged && member.review_reason && (
              <p className="px-3 py-1.5 text-[10px] leading-snug text-amber-300/90 border-b border-white/10">
                {member.review_reason}
              </p>
            )}
            {onEditRelationship && (
              <button
                type="button"
                role="menuitem"
                onClick={() => { setOpen(false); onEditRelationship(member); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-white/80 hover:bg-white/10"
              >
                <Pencil className="h-3.5 w-3.5" /> Edit relationship
              </button>
            )}
            {onExclude && (
              <button
                type="button"
                role="menuitem"
                onClick={() => { setOpen(false); onExclude(member); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-white/80 hover:bg-white/10"
              >
                <UserMinus className="h-3.5 w-3.5" /> Remove from family
              </button>
            )}
            {onMoveToGroup && (
              <button
                type="button"
                role="menuitem"
                data-testid={`move-to-group-${member.id}`}
                onClick={() => { setOpen(false); onMoveToGroup(member); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-violet-200 hover:bg-violet-500/15"
              >
                <Building2 className="h-3.5 w-3.5" /> Move to Groups
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                role="menuitem"
                onClick={() => { setOpen(false); onDelete(member); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-red-300 hover:bg-red-500/15"
              >
                <Trash2 className="h-3.5 w-3.5" /> Not a person — delete
              </button>
            )}
            {flagged && onKeep && (
              <button
                type="button"
                role="menuitem"
                onClick={() => { setOpen(false); onKeep(member); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-emerald-300 hover:bg-emerald-500/15"
              >
                <Check className="h-3.5 w-3.5" /> Keep in family
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
};

// ── Generation header ──────────────────────────────────────────────────────────

const GenHeader = ({ label }: { label: string }) => (
  <div className="flex items-center gap-2 mb-3">
    <div className="h-px flex-1 bg-white/8" />
    <span className="text-[9px] font-semibold text-white/25 uppercase tracking-widest px-1">{label}</span>
    <div className="h-px flex-1 bg-white/8" />
  </div>
);

const GEN_LABELS: Record<number, string> = {
  [-3]: 'Great-Grandparents',
  [-2]: 'Grandparents',
  [-1]: 'Parents / Aunts / Uncles',
  [0]:  'Your Generation',
  [1]:  'Children',
  [2]:  'Grandchildren',
};

// ── FamilyTreeView ─────────────────────────────────────────────────────────────

interface SvgLine { x1: number; y1: number; x2: number; y2: number; fromId: string; toId: string }

function moveInArray<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) {
    return list;
  }
  const next = [...list];
  const [removed] = next.splice(from, 1);
  next.splice(to, 0, removed);
  return next;
}

export const FamilyTreeView = ({
  tree,
  onMemberClick,
  compact = false,
  onEditRelationship,
  onExclude,
  onMoveToGroup,
  onDelete,
  onKeep,
  onReorderRow,
  onConnectMembers,
  onDisconnectParent,
}: FamilyTreeViewProps) => {
  const { members } = tree;
  const isMobile = useIsMobile();
  const membersById = new Map(members.map((m) => [m.id, m]));

  const containerRef = useRef<HTMLDivElement>(null);
  const nodeEls      = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [lines, setLines] = useState<SvgLine[]>([]);
  const [svgW, setSvgW]   = useState(0);
  const [svgH, setSvgH]   = useState(0);

  // Connect mode: drag from one person to another (desktop) or tap-tap
  // (mobile, no native drag) to create a connection. Mutually exclusive with
  // reorder mode — both use drag gestures on the same nodes.
  const [connectMode, setConnectMode] = useState(false);
  const [connectFromId, setConnectFromId] = useState<string | null>(null);
  const [pendingConnect, setPendingConnect] = useState<{
    fromId: string; toId: string; x: number; y: number;
  } | null>(null);
  const [connecting, setConnecting] = useState(false);

  // A clicked connector line, pending disconnect confirmation.
  const [selectedLine, setSelectedLine] = useState<{
    fromId: string; toId: string; x: number; y: number;
  } | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  const beginConnectFrom = useCallback((id: string) => {
    setSelectedLine(null);
    setConnectFromId((prev) => (prev === id ? null : id));
  }, []);

  const completeConnect = useCallback(
    (toId: string, x: number, y: number) => {
      if (!connectFromId || connectFromId === toId) {
        setConnectFromId(null);
        return;
      }
      setPendingConnect({ fromId: connectFromId, toId, x, y });
      setConnectFromId(null);
    },
    [connectFromId],
  );

  const confirmConnect = useCallback(
    async (kind: 'parent' | 'spouse') => {
      if (!pendingConnect || !onConnectMembers) return;
      const from = members.find((mm) => mm.id === pendingConnect.fromId);
      const to = members.find((mm) => mm.id === pendingConnect.toId);
      if (!from || !to) { setPendingConnect(null); return; }
      setConnecting(true);
      try {
        await onConnectMembers(from, to, kind);
        setPendingConnect(null);
      } finally {
        setConnecting(false);
      }
    },
    [pendingConnect, onConnectMembers, members],
  );

  const confirmDisconnect = useCallback(async () => {
    if (!selectedLine || !onDisconnectParent) return;
    const target = members.find((m) => m.id === selectedLine.toId);
    if (!target) { setSelectedLine(null); return; }
    setDisconnecting(true);
    try {
      await onDisconnectParent(target);
      setSelectedLine(null);
    } finally {
      setDisconnecting(false);
    }
  }, [selectedLine, onDisconnectParent, members]);

  // Drag-to-reorder (placement editing). Row order comes from the server
  // (sortFamilyMembersForDisplay) — this is only a local working copy of
  // whichever rows the user has actively rearranged since entering reorder
  // mode, keyed by generation. Cleared once every dirty row saves, since the
  // parent refetches the tree and the server-sorted order takes back over.
  const [reorderMode, setReorderMode] = useState(false);
  const [rowOverrides, setRowOverrides] = useState<Map<number, string[]>>(new Map());
  const [dragMemberId, setDragMemberId] = useState<string | null>(null);
  const [savingReorder, setSavingReorder] = useState(false);
  const dirtyGenerations = rowOverrides.size > 0;

  const moveWithinRow = useCallback((gen: number, rowIds: string[], from: number, to: number) => {
    const next = moveInArray(rowIds, from, to);
    if (next === rowIds) return;
    setRowOverrides((prev) => {
      const copy = new Map(prev);
      copy.set(gen, next);
      return copy;
    });
  }, []);

  const saveReorder = useCallback(async () => {
    if (!onReorderRow || rowOverrides.size === 0) return;
    setSavingReorder(true);
    try {
      for (const orderedIds of rowOverrides.values()) {
        await onReorderRow(orderedIds);
      }
      setRowOverrides(new Map());
      setReorderMode(false);
    } finally {
      setSavingReorder(false);
    }
  }, [onReorderRow, rowOverrides]);

  const handleNodeRef = useCallback((id: string, el: HTMLButtonElement | null) => {
    if (el) nodeEls.current.set(id, el);
    else    nodeEls.current.delete(id);
  }, []);

  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const cRect = container.getBoundingClientRect();
    setSvgW(cRect.width);
    setSvgH(cRect.height);

    const logicalEdges = inferEdges(members);
    const measured: SvgLine[] = [];

    // Avatar diameter in px (matches Tailwind w-12/w-14 classes)
    const avatarDia = compact ? 40 : 48;

    for (const edge of logicalEdges) {
      const fromEl = nodeEls.current.get(edge.from);
      const toEl   = nodeEls.current.get(edge.to);
      if (!fromEl || !toEl) continue;

      const fRect = fromEl.getBoundingClientRect();
      const tRect = toEl.getBoundingClientRect();

      // Bottom-center of parent avatar → top-center of child avatar
      const x1 = fRect.left + fRect.width / 2 - cRect.left;
      const y1 = fRect.top  + avatarDia        - cRect.top;   // bottom of avatar
      const x2 = tRect.left + tRect.width / 2  - cRect.left;
      const y2 = tRect.top                     - cRect.top;   // top of child avatar

      measured.push({ x1, y1, x2, y2, fromId: edge.from, toId: edge.to });
    }

    setLines(measured);
  }, [members, compact]);

  // Measure after first paint and on resize
  useEffect(() => {
    const id = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(id);
  }, [measure]);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(measure);
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [measure]);

  // Group members by generation
  const byGen = new Map<number, FamilyMember[]>();
  for (const m of members) {
    if (!byGen.has(m.generation)) byGen.set(m.generation, []);
    byGen.get(m.generation)!.push(m);
  }
  const generations = Array.from(byGen.keys()).sort((a, b) => a - b);

  if (members.length === 0) {
    return (
      <div className="text-center py-10 text-white/30">
        <Heart className="h-8 w-8 mx-auto mb-2 opacity-20" />
        <p className="text-sm">No family members recorded yet.</p>
        <p className="text-xs mt-1 text-white/20">Mention family in your journal and LoreBook will build your tree.</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative space-y-5">

      {/* SVG connector overlay. Lines become clickable (disconnect) while in
          Connect mode -- otherwise purely decorative, same as before. */}
      {lines.length > 0 && (
        <svg
          className={`absolute inset-0 overflow-visible z-0 ${connectMode && onDisconnectParent ? '' : 'pointer-events-none'}`}
          width={svgW}
          height={svgH}
        >
          {lines.map((l, i) => {
            // Cubic bezier: control points pull vertically from each end
            const cp1y = l.y1 + (l.y2 - l.y1) * 0.4;
            const cp2y = l.y2 - (l.y2 - l.y1) * 0.4;
            const d = `M ${l.x1} ${l.y1} C ${l.x1} ${cp1y}, ${l.x2} ${cp2y}, ${l.x2} ${l.y2}`;
            const clickable = connectMode && Boolean(onDisconnectParent);
            const isSelected = selectedLine?.fromId === l.fromId && selectedLine?.toId === l.toId;
            const handleLineClick = clickable
              ? (e: ReactMouseEvent) => setSelectedLine({ fromId: l.fromId, toId: l.toId, x: e.clientX, y: e.clientY })
              : undefined;
            return (
              <g key={i}>
                {clickable && (
                  <path
                    d={d}
                    fill="none"
                    stroke="transparent"
                    strokeWidth="16"
                    strokeLinecap="round"
                    style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                    onClick={handleLineClick}
                  />
                )}
                <path
                  d={d}
                  fill="none"
                  stroke={isSelected ? 'rgba(248,113,113,0.85)' : 'rgba(255,255,255,0.18)'}
                  strokeWidth={isSelected ? 2.5 : 1.5}
                  strokeLinecap="round"
                  style={clickable ? { pointerEvents: 'stroke', cursor: 'pointer' } : undefined}
                  onClick={handleLineClick}
                />
              </g>
            );
          })}
        </svg>
      )}

      {/* Branch legend — family side ring colors */}
      {!compact && tree.branches.length > 0 && (
        <div className="rounded-xl border border-white/15 bg-white/[0.04] px-3 py-2.5 relative z-[1]">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/50 mb-2">Family side rings</p>
          <div className="flex flex-wrap gap-2">
            {tree.branches.map((b) => (
              <span
                key={b.side}
                className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-black/30 px-2.5 py-1.5 text-[11px] text-white/75"
              >
                <span
                  className="h-4 w-4 rounded-full border-2 shrink-0"
                  style={{
                    borderColor: b.color,
                    boxShadow: `0 0 8px ${b.color}88`,
                    background: `${b.color}22`,
                  }}
                />
                {b.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Reorder / Connect toggles */}
      {!compact && (onReorderRow || onConnectMembers) && (
        <div className="flex items-center justify-end gap-1.5 relative z-[1]">
          {dirtyGenerations && (
            <button
              type="button"
              disabled={savingReorder}
              onClick={() => void saveReorder()}
              className="px-3 py-1.5 rounded-lg bg-primary/20 text-primary border border-primary/40 text-xs font-medium hover:bg-primary/30 disabled:opacity-50"
            >
              {savingReorder ? 'Saving…' : 'Save order'}
            </button>
          )}
          {onConnectMembers && (
            <button
              type="button"
              onClick={() => {
                if (connectMode) { setConnectFromId(null); setPendingConnect(null); }
                setSelectedLine(null);
                setReorderMode(false);
                setConnectMode((v) => !v);
              }}
              aria-pressed={connectMode ? 'true' : 'false'}
              title={connectMode ? 'Done connecting people' : 'Drag one person onto another to connect them'}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                connectMode
                  ? 'border-emerald-400/50 text-emerald-300 bg-emerald-500/15'
                  : 'border-white/10 text-white/60 hover:text-white hover:border-white/25'
              }`}
            >
              <Link2 className="h-3.5 w-3.5" />
              {connectMode ? 'Done' : 'Connect'}
            </button>
          )}
          {onReorderRow && (
            <button
              type="button"
              onClick={() => {
                if (reorderMode) setRowOverrides(new Map());
                setConnectMode(false);
                setReorderMode((v) => !v);
              }}
              aria-pressed={reorderMode ? 'true' : 'false'}
              title={reorderMode ? 'Done placing people' : 'Drag people to fix their placement'}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                reorderMode
                  ? 'border-primary/50 text-primary bg-primary/15'
                  : 'border-white/10 text-white/60 hover:text-white hover:border-white/25'
              }`}
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
              {reorderMode ? 'Done' : 'Reorder'}
            </button>
          )}
        </div>
      )}
      {reorderMode && (
        <p className="text-[11px] text-white/40 -mt-3 relative z-[1]">
          {isMobile
            ? 'Use the arrows on each person to move them left or right, then save.'
            : 'Drag anyone to reposition them within their row, then save.'}
        </p>
      )}
      {connectMode && (
        <p className="text-[11px] text-white/40 -mt-3 relative z-[1]">
          {isMobile
            ? connectFromId
              ? 'Now tap who they connect to.'
              : 'Tap someone, then tap who they connect to.'
            : 'Drag anyone onto someone else to connect them. Click a line to disconnect it.'}
        </p>
      )}

      {/* Generational rows */}
      {generations.map(gen => {
        const gMembers = byGen.get(gen)!;
        const label = GEN_LABELS[gen] ?? (gen < 0 ? `Generation ${Math.abs(gen)} Above` : `Generation ${gen} Below`);
        const self   = gMembers.find(m => m.is_self);
        const naturalOthers = gMembers.filter(m => !m.is_self);
        const byId = new Map(naturalOthers.map((m) => [m.id, m]));
        const override = rowOverrides.get(gen);
        // A local override drives display while dragging; anyone it doesn't
        // mention yet (e.g. the row changed underneath since reorder mode
        // opened) falls back after it, in natural order.
        const others = override
          ? [
              ...override.map((id) => byId.get(id)).filter((m): m is FamilyMember => Boolean(m)),
              ...naturalOthers.filter((m) => !override.includes(m.id)),
            ]
          : naturalOthers;
        const canDrag = reorderMode && !isMobile && others.length > 1;
        const canArrow = reorderMode && isMobile && others.length > 1;

        const moveOther = (from: number, to: number) => {
          moveWithinRow(gen, others.map((m) => m.id), from, to);
        };

        return (
          <div key={gen} className="relative z-[1]">
            <GenHeader label={label} />
            <div className={`flex flex-wrap justify-center gap-3 sm:gap-4 ${gen === 0 ? 'items-start' : ''}`}>
              {self && (
                <div className="flex flex-col items-center">
                  <PersonNode member={self} onClick={onMemberClick} compact={compact} onNodeRef={handleNodeRef} />
                  {!compact && (
                    <span className="text-[8px] text-primary/60 mt-0.5 font-semibold uppercase tracking-widest">You</span>
                  )}
                </div>
              )}
              {others.map((m, idx) => {
                const canConnect = connectMode && !m.is_placeholder;
                const canConnectDrag = canConnect && !isMobile;
                const canConnectTap = canConnect && isMobile;
                return (
                <div
                  key={m.id}
                  draggable={canDrag || canConnectDrag}
                  onDragStart={
                    canConnectDrag ? () => setConnectFromId(m.id)
                    : canDrag ? () => setDragMemberId(m.id)
                    : undefined
                  }
                  onDragEnd={
                    canConnectDrag ? () => setConnectFromId(null)
                    : canDrag ? () => setDragMemberId(null)
                    : undefined
                  }
                  onDragOver={canDrag || canConnectDrag ? (e) => e.preventDefault() : undefined}
                  onDrop={
                    canConnectDrag
                      ? (e) => completeConnect(m.id, e.clientX, e.clientY)
                      : canDrag
                      ? () => {
                          if (dragMemberId == null) return;
                          const from = others.findIndex((x) => x.id === dragMemberId);
                          if (from === -1 || from === idx) return;
                          moveOther(from, idx);
                          setDragMemberId(null);
                        }
                      : undefined
                  }
                  onClick={
                    canConnectTap
                      ? (e) => {
                          if (connectFromId && connectFromId !== m.id) {
                            completeConnect(m.id, e.clientX, e.clientY);
                          } else {
                            beginConnectFrom(m.id);
                          }
                        }
                      : undefined
                  }
                  className={`flex flex-col items-center ${
                    canDrag ? `cursor-grab active:cursor-grabbing ${dragMemberId === m.id ? 'opacity-50' : ''}` : ''
                  } ${canConnect ? 'cursor-pointer' : ''} ${
                    connectFromId === m.id ? 'ring-2 ring-emerald-400/70 rounded-2xl' : ''
                  }`}
                >
                  <NodeWithActions
                    member={m}
                    onClick={reorderMode || canConnectTap ? undefined : onMemberClick}
                    compact={compact}
                    onNodeRef={handleNodeRef}
                    onEditRelationship={reorderMode || connectMode ? undefined : onEditRelationship}
                    onExclude={reorderMode || connectMode ? undefined : onExclude}
                    onMoveToGroup={reorderMode || connectMode ? undefined : onMoveToGroup}
                    onDelete={reorderMode || connectMode ? undefined : onDelete}
                    onKeep={reorderMode || connectMode ? undefined : onKeep}
                  />
                  {canDrag && (
                    <GripVertical className="h-3.5 w-3.5 text-white/25 -mt-1" />
                  )}
                  {canArrow && (
                    <div className="flex items-center gap-1 mt-1">
                      <button
                        type="button"
                        aria-label={`Move ${m.name} left`}
                        disabled={idx === 0}
                        onClick={() => moveOther(idx, idx - 1)}
                        className="p-1.5 rounded-lg border border-white/10 text-white/60 active:bg-white/10 disabled:opacity-20 touch-manipulation"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${m.name} right`}
                        disabled={idx === others.length - 1}
                        onClick={() => moveOther(idx, idx + 1)}
                        className="p-1.5 rounded-lg border border-white/10 text-white/60 active:bg-white/10 disabled:opacity-20 touch-manipulation"
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Relation color legend */}
      {!compact && (
        <div className="pt-3 mt-1 border-t border-white/15 relative rounded-xl bg-white/[0.03] px-3 py-3 z-[1]">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/50 mb-2.5">
            Relationship colors
          </p>
          <div className="flex flex-wrap gap-2">
            {LEGEND_GROUPS.map(({ keys, label }) => {
              const style = relationStyle(keys[0]);
              return (
                <span
                  key={label}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-black/35 px-2.5 py-1.5 text-[11px] text-white/80"
                >
                  <span
                    className={`h-4 w-4 rounded-full border-2 shrink-0 ${style.swatch} ${style.shadow}`}
                  />
                  {label}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Connect quick-pick — appears after dragging/tapping one person onto
          another; asks what the dragged-from person is to the drop target. */}
      {pendingConnect && (() => {
        const from = members.find((mm) => mm.id === pendingConnect.fromId);
        const to = members.find((mm) => mm.id === pendingConnect.toId);
        if (!from || !to) return null;
        const sameGeneration = from.generation === to.generation;
        return (
          <>
            <div className="fixed inset-0 z-[90]" onClick={() => setPendingConnect(null)} aria-hidden />
            <div
              role="menu"
              className="fixed z-[95] w-56 -translate-x-1/2 rounded-lg border border-white/15 bg-[#15131f] py-1.5 text-left shadow-2xl"
              style={{ left: pendingConnect.x, top: pendingConnect.y }}
            >
              <p className="px-3 pb-1.5 text-[10px] leading-snug text-white/50 border-b border-white/10 mb-1">
                Connect <span className="text-white/80">{from.name}</span> to <span className="text-white/80">{to.name}</span>
              </p>
              <button
                type="button"
                role="menuitem"
                disabled={connecting}
                onClick={() => void confirmConnect('parent')}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-white/80 hover:bg-white/10 disabled:opacity-50"
              >
                {from.name} is {to.name}'s parent
              </button>
              {sameGeneration && (
                <button
                  type="button"
                  role="menuitem"
                  disabled={connecting}
                  onClick={() => void confirmConnect('spouse')}
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs text-white/80 hover:bg-white/10 disabled:opacity-50"
                >
                  Married to / partnered with {to.name}
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                onClick={() => setPendingConnect(null)}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-white/50 hover:bg-white/10"
              >
                Cancel
              </button>
            </div>
          </>
        );
      })()}

      {/* Disconnect confirm — appears after clicking a connector line. */}
      {selectedLine && (() => {
        const to = members.find((mm) => mm.id === selectedLine.toId);
        if (!to) return null;
        return (
          <>
            <div className="fixed inset-0 z-[90]" onClick={() => setSelectedLine(null)} aria-hidden />
            <div
              role="menu"
              className="fixed z-[95] -translate-x-1/2 rounded-lg border border-red-400/25 bg-[#1f1315] px-3 py-2 text-left shadow-2xl"
              style={{ left: selectedLine.x, top: selectedLine.y }}
            >
              <button
                type="button"
                disabled={disconnecting}
                onClick={() => void confirmDisconnect()}
                className="flex items-center gap-1.5 text-xs font-medium text-red-300 hover:text-red-200 disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" />
                {disconnecting ? 'Disconnecting…' : `Disconnect from ${to.name}`}
              </button>
            </div>
          </>
        );
      })()}
    </div>
  );
};

// ── Mock data ──────────────────────────────────────────────────────────────────

export const createMockUserFamilyTree = (): FamilyTree => ({
  self_id: 'self',
  branches: [
    { side: 'paternal', label: "Whitmore (Dad's side)", color: '#60a5fa' },
    { side: 'maternal', label: "Chen (Mom's side)",    color: '#f472b6' },
    { side: 'partner',  label: 'Partner side',         color: '#34d399' },
  ],
  members: [
    { id: 'self',     name: 'You',                 relation: 'related',      relation_label: 'You',          generation: 0,  is_self: true },
    { id: 'dad',      name: 'Roberto Whitmore',     first_name: 'Roberto',   relation: 'parent',      relation_label: 'Dad',          generation: -1, birth_year: 1966, side: 'paternal', closeness: 72 },
    { id: 'mom',      name: 'Elena Chen-Whitmore',  first_name: 'Elena',     relation: 'parent',      relation_label: 'Mom',          generation: -1, birth_year: 1969, side: 'maternal', closeness: 81 },
    { id: 'jordan',   name: 'Jordan Kim',          first_name: 'Jordan',    relation: 'half_sibling', relation_label: 'Half-sibling', generation: 0,  side: 'maternal', closeness: 93 },
    { id: 'gpa-m',    name: 'Miguel Whitmore',      first_name: 'Miguel',    relation: 'grandparent', relation_label: 'Grandpa',      generation: -2, birth_year: 1938, side: 'paternal', deceased: true },
    { id: 'gma-m',    name: 'Carmen Whitmore',      first_name: 'Carmen',    relation: 'grandparent', relation_label: 'Grandma',      generation: -2, birth_year: 1942, side: 'paternal', closeness: 65 },
    { id: 'gpa-c',    name: 'James Chen',          first_name: 'James',     relation: 'grandparent', relation_label: 'Grandpa',      generation: -2, birth_year: 1944, side: 'maternal', closeness: 58 },
    { id: 'gma-c',    name: 'Susan Chen',          first_name: 'Susan',     relation: 'grandparent', relation_label: 'Grandma',      generation: -2, birth_year: 1947, side: 'maternal', closeness: 61 },
    { id: 'uncle-dc', name: 'David Chen',          first_name: 'David',     relation: 'uncle',       relation_label: 'Uncle',        generation: -1, birth_year: 1972, side: 'maternal', closeness: 45 },
    { id: 'zoe',      name: 'Zoe Chen',            first_name: 'Zoe',       relation: 'cousin',      relation_label: 'Cousin',       generation: 0,  side: 'maternal', closeness: 88 },
    { id: 'alex-gf',  name: 'Alex',               first_name: 'Alex',      relation: 'spouse',      relation_label: 'Partner',      generation: 0,  side: 'partner',  closeness: 99 },
  ],
});

export const createMockFamilyTreeForCharacter = (characterName: string): FamilyTree | null => {
  const trees: Record<string, FamilyTree> = {
    'Jordan Kim': {
      self_id: 'jordan',
      branches: [
        { side: 'maternal', label: 'Chen side (shared w/ you)', color: '#f472b6' },
        { side: 'paternal', label: 'Kim side',                  color: '#818cf8' },
      ],
      members: [
        { id: 'jordan',    name: 'Jordan Kim',          first_name: 'Jordan',   relation: 'related',      relation_label: 'Jordan',       generation: 0,  is_self: true },
        { id: 'mom-shared',name: 'Elena Chen-Whitmore',  first_name: 'Elena',    relation: 'parent',       relation_label: 'Mom (shared)', generation: -1, side: 'maternal' },
        { id: 'dad-kim',   name: 'David Kim',           first_name: 'David',    relation: 'parent',       relation_label: 'Dad',          generation: -1, side: 'paternal' },
        { id: 'self-ref',  name: 'You',                 first_name: 'You',      relation: 'half_sibling', relation_label: 'Half-sibling', generation: 0,  side: 'maternal' },
        { id: 'gma-kim',   name: 'Soon-hee Kim',        first_name: 'Soon-hee', relation: 'grandparent',  relation_label: 'Grandma',      generation: -2, side: 'paternal' },
        { id: 'gpa-kim',   name: 'Jin-woo Kim',         first_name: 'Jin-woo',  relation: 'grandparent',  relation_label: 'Grandpa',      generation: -2, side: 'paternal' },
      ],
    },
    'Zoe Chen': {
      self_id: 'zoe',
      branches: [
        { side: 'paternal', label: 'Chen side (shared w/ you)', color: '#f472b6' },
        { side: 'other',    label: 'Wong side',                 color: '#fbbf24' },
      ],
      members: [
        { id: 'zoe',      name: 'Zoe Chen',           first_name: 'Zoe',      relation: 'related',     relation_label: 'Zoe',             generation: 0,  is_self: true },
        { id: 'dad-chen', name: 'David Chen',         first_name: 'David',    relation: 'parent',      relation_label: 'Dad',             generation: -1, side: 'paternal' },
        { id: 'mom-wong', name: 'Patricia Wong-Chen', first_name: 'Patricia', relation: 'parent',      relation_label: 'Mom',             generation: -1, side: 'other' },
        { id: 'self-ref', name: 'You',                first_name: 'You',      relation: 'cousin',      relation_label: 'Cousin',          generation: 0,  side: 'paternal' },
        { id: 'gpa-c-s',  name: 'James Chen',         first_name: 'James',    relation: 'grandparent', relation_label: 'Grandpa (shared)', generation: -2, side: 'paternal' },
        { id: 'gma-c-s',  name: 'Susan Chen',         first_name: 'Susan',    relation: 'grandparent', relation_label: 'Grandma (shared)', generation: -2, side: 'paternal' },
      ],
    },
  };
  return trees[characterName] ?? null;
};
