import { useRef, useEffect, useState, useCallback } from 'react';
import { Heart, User } from 'lucide-react';
import type { FamilyMember, FamilyTree } from '../../types/socialRoles';

interface FamilyTreeViewProps {
  tree: FamilyTree;
  onMemberClick?: (member: FamilyMember) => void;
  compact?: boolean;
}

const RELATION_COLORS: Record<string, string> = {
  parent:       'border-violet-500/60 bg-violet-950/30',
  grandparent:  'border-purple-500/60 bg-purple-950/30',
  sibling:      'border-cyan-500/60 bg-cyan-950/30',
  twin:         'border-cyan-500/60 bg-cyan-950/30',
  cousin:       'border-teal-500/60 bg-teal-950/30',
  spouse:       'border-rose-500/60 bg-rose-950/30',
  child:        'border-emerald-500/60 bg-emerald-950/30',
  grandchild:   'border-green-500/60 bg-green-950/30',
  aunt:         'border-amber-500/60 bg-amber-950/30',
  uncle:        'border-amber-500/60 bg-amber-950/30',
  in_law:       'border-orange-500/60 bg-orange-950/30',
  step_parent:  'border-violet-500/40 bg-violet-950/20',
  step_sibling: 'border-cyan-500/40 bg-cyan-950/20',
  half_sibling: 'border-cyan-500/50 bg-cyan-950/25',
  default:      'border-white/20 bg-white/5',
};

const SIDE_ACCENT: Record<string, string> = {
  maternal: 'ring-rose-400/40',
  paternal: 'ring-blue-400/40',
  partner:  'ring-emerald-400/40',
  other:    'ring-white/20',
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

function inferEdges(members: FamilyMember[]): Array<{ from: string; to: string }> {
  const edges: Array<{ from: string; to: string }> = [];

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

  return edges;
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
  const borderCls = member.is_self
    ? 'border-primary/70 bg-primary/10 shadow-[0_0_12px_rgba(124,58,237,0.4)]'
    : member.is_placeholder
      ? 'border-dashed border-white/25 bg-white/[0.03]'
    : RELATION_COLORS[member.relation] ?? RELATION_COLORS.default;
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
      <div className={`rounded-full border-2 ${borderCls} ${sideCls} ${closenessCls} overflow-hidden flex items-center justify-center transition-transform group-hover:scale-105 ${compact ? 'w-10 h-10' : 'w-12 h-12 sm:w-14 sm:h-14'}`}>
        {member.avatar_url ? (
          <img src={member.avatar_url} alt={member.name} className="w-full h-full object-cover" />
        ) : member.is_self ? (
          <User className={`${compact ? 'h-5 w-5' : 'h-6 w-6'} text-primary`} />
        ) : member.is_placeholder ? (
          <User className={`${compact ? 'h-4 w-4' : 'h-5 w-5'} text-white/35`} />
        ) : (
          <span className={`font-bold text-white/70 ${compact ? 'text-xs' : 'text-sm'}`}>
            {member.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
          </span>
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
        {member.deceased && <p className="text-[8px] text-white/25 italic">†</p>}
      </div>
    </button>
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

export const FamilyTreeView = ({ tree, onMemberClick, compact = false }: FamilyTreeViewProps) => {
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
          className="absolute inset-0 pointer-events-none"
          width={svgW}
          height={svgH}
          style={{ overflow: 'visible', zIndex: 0 }}
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

      {/* Branch legend */}
      {!compact && tree.branches.length > 0 && (
        <div className="flex flex-wrap gap-2 relative" style={{ zIndex: 1 }}>
          {tree.branches.map(b => (
            <span key={b.side} className="text-[9px] text-white/40 flex items-center gap-1">
              <span className="h-2 w-2 rounded-full inline-block" style={{ background: b.color }} />
              {b.label}
            </span>
          ))}
        </div>
      )}

      {/* Generational rows */}
      {generations.map(gen => {
        const gMembers = byGen.get(gen)!;
        const label = GEN_LABELS[gen] ?? (gen < 0 ? `Generation ${Math.abs(gen)} Above` : `Generation ${gen} Below`);
        const self   = gMembers.find(m => m.is_self);
        const others = gMembers.filter(m => !m.is_self);

        return (
          <div key={gen} className="relative" style={{ zIndex: 1 }}>
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
                <PersonNode key={m.id} member={m} onClick={onMemberClick} compact={compact} onNodeRef={handleNodeRef} />
              ))}
            </div>
          </div>
        );
      })}

      {/* Relation color legend */}
      {!compact && (
        <div className="pt-2 border-t border-white/8 flex flex-wrap gap-x-4 gap-y-1 relative" style={{ zIndex: 1 }}>
          {[
            { color: 'bg-violet-400', label: 'Parent / Grandparent' },
            { color: 'bg-cyan-400',   label: 'Sibling' },
            { color: 'bg-rose-400',   label: 'Partner' },
            { color: 'bg-teal-400',   label: 'Cousin' },
            { color: 'bg-amber-400',  label: 'Aunt / Uncle' },
          ].map(({ color, label }) => (
            <span key={label} className="flex items-center gap-1 text-[9px] text-white/30">
              <span className={`h-1.5 w-1.5 rounded-full ${color}`} />
              {label}
            </span>
          ))}
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
