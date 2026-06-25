import { useRef, useEffect, useState, useCallback } from 'react';
import { Heart, User, MoreVertical, AlertTriangle, Pencil, UserMinus, Trash2, Check } from 'lucide-react';
import { CharacterAvatar } from '../characters/CharacterAvatar';
import type { FamilyMember, FamilyTree } from '../../types/socialRoles';

interface FamilyTreeViewProps {
  tree: FamilyTree;
  onMemberClick?: (member: FamilyMember) => void;
  compact?: boolean;
  /** Correct how a member relates (opens the relationship editor). */
  onEditRelationship?: (member: FamilyMember) => void;
  /** Remove from the tree but keep the character. */
  onExclude?: (member: FamilyMember) => void;
  /** Delete the character entirely — it shouldn't be a character. */
  onDelete?: (member: FamilyMember) => void;
  /** Confirm a flagged member is really family (clears the review flag). */
  onKeep?: (member: FamilyMember) => void;
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
      const aunt = parents.find(
        p => (p.relation === 'aunt' || p.relation === 'uncle') && p.side === member.side,
      );
      if (aunt) edges.push({ from: aunt.id, to: member.id });
    } else if (member.relation !== 'related') {
      // Generic fallback: match by side
      const sideParent = parents.find(p => p.side && member.side && p.side === member.side);
      if (sideParent) edges.push({ from: sideParent.id, to: member.id });
    }
  }

  // Self → Children
  if (self) {
    for (const child of children) edges.push({ from: self.id, to: child.id });
  }

  // Children → Grandchildren (side match)
  for (const child of children) {
    for (const gc of grandchildren) {
      if (gc.side && child.side && gc.side === child.side) {
        edges.push({ from: child.id, to: gc.id });
      }
    }
  }

  // Drop inferred connectors for any child the user explicitly re-parented,
  // then add the explicit links.
  const reconciled = edges.filter(e => !pinnedChildren.has(e.to));
  reconciled.push(...explicitEdges);
  return reconciled;
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
    : member.is_placeholder
      ? 'border-[3px] border-dashed border-white/40 bg-white/[0.06]'
      : `${style.node} ${style.shadow}`;
  const sideCls = member.side ? SIDE_ACCENT[member.side] ?? '' : '';
  const closenessCls = closenessRing(member.closeness);

  return (
    <button
      type="button"
      ref={el => onNodeRef?.(member.id, el)}
      onClick={() => !member.is_placeholder && onClick?.(member)}
      disabled={member.is_placeholder}
      className={`flex flex-col items-center gap-1 group ${onClick && !member.is_placeholder ? 'cursor-pointer' : 'cursor-default'} ${member.is_placeholder ? 'opacity-70' : ''}`}
      title={`${member.name}${member.kinship_title && member.name.trim().toLowerCase() !== member.kinship_title.toLowerCase() ? ` (${member.kinship_title})` : ''} — ${member.relation_label}`}
    >
      <div className={`rounded-full ${borderCls} ${sideCls} ${closenessCls} overflow-hidden flex items-center justify-center transition-transform group-hover:scale-105 ${compact ? 'w-10 h-10' : 'w-12 h-12 sm:w-14 sm:h-14'}`}>
        {member.is_self ? (
          <User className={`${compact ? 'h-5 w-5' : 'h-6 w-6'} text-primary`} />
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
      <div className="text-center max-w-[86px]">
        <p className={`font-medium text-white/90 leading-tight line-clamp-2 ${compact ? 'text-[9px]' : 'text-[10px] sm:text-xs'}`}>
          {member.name}
        </p>
        <p className={`text-white/40 leading-tight line-clamp-2 ${compact ? 'text-[8px]' : 'text-[9px]'}`}>
          {member.kinship_title && member.name.trim().toLowerCase() !== member.kinship_title.toLowerCase()
            ? `${member.relation_label} · ${member.kinship_title}`
            : member.relation_label}
        </p>
        {!member.is_self && !member.is_placeholder && !compact && (
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
  onDelete,
  onKeep,
}: {
  member: FamilyMember;
  onClick?: (m: FamilyMember) => void;
  compact?: boolean;
  onNodeRef?: (id: string, el: HTMLButtonElement | null) => void;
  onEditRelationship?: (m: FamilyMember) => void;
  onExclude?: (m: FamilyMember) => void;
  onDelete?: (m: FamilyMember) => void;
  onKeep?: (m: FamilyMember) => void;
}) => {
  const [open, setOpen] = useState(false);
  const editable = !member.is_self && !member.is_placeholder && Boolean(onEditRelationship || onExclude || onDelete);
  const flagged = Boolean(member.needs_review) && !member.is_self && !member.is_placeholder;

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

interface SvgLine { x1: number; y1: number; x2: number; y2: number }

export const FamilyTreeView = ({
  tree,
  onMemberClick,
  compact = false,
  onEditRelationship,
  onExclude,
  onDelete,
  onKeep,
}: FamilyTreeViewProps) => {
  const { members } = tree;

  const containerRef = useRef<HTMLDivElement>(null);
  const nodeEls      = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [lines, setLines] = useState<SvgLine[]>([]);
  const [svgW, setSvgW]   = useState(0);
  const [svgH, setSvgH]   = useState(0);

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

      measured.push({ x1, y1, x2, y2 });
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

      {/* SVG connector overlay */}
      {lines.length > 0 && (
        <svg
          className="absolute inset-0 pointer-events-none overflow-visible z-0"
          width={svgW}
          height={svgH}
        >
          {lines.map((l, i) => {
            // Cubic bezier: control points pull vertically from each end
            const cp1y = l.y1 + (l.y2 - l.y1) * 0.4;
            const cp2y = l.y2 - (l.y2 - l.y1) * 0.4;
            const d = `M ${l.x1} ${l.y1} C ${l.x1} ${cp1y}, ${l.x2} ${cp2y}, ${l.x2} ${l.y2}`;
            return (
              <path
                key={i}
                d={d}
                fill="none"
                stroke="rgba(255,255,255,0.18)"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
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

      {/* Generational rows */}
      {generations.map(gen => {
        const gMembers = byGen.get(gen)!;
        const label = GEN_LABELS[gen] ?? (gen < 0 ? `Generation ${Math.abs(gen)} Above` : `Generation ${gen} Below`);
        const self   = gMembers.find(m => m.is_self);
        const others = gMembers.filter(m => !m.is_self);

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
              {others.map(m => (
                <NodeWithActions
                  key={m.id}
                  member={m}
                  onClick={onMemberClick}
                  compact={compact}
                  onNodeRef={handleNodeRef}
                  onEditRelationship={onEditRelationship}
                  onExclude={onExclude}
                  onDelete={onDelete}
                  onKeep={onKeep}
                />
              ))}
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
