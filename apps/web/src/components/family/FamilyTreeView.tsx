import { useRef, useEffect, useState } from 'react';
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

// Closeness indicator ring
const closenessRing = (closeness?: number) => {
  if (!closeness) return '';
  if (closeness >= 80) return 'ring-2 ring-purple-400/70 shadow-[0_0_8px_rgba(168,85,247,0.5)]';
  if (closeness >= 60) return 'ring-2 ring-cyan-400/50';
  if (closeness >= 40) return 'ring-1 ring-white/25';
  return '';
};

// Person node
const PersonNode = ({
  member,
  onClick,
  compact,
}: {
  member: FamilyMember;
  onClick?: (m: FamilyMember) => void;
  compact?: boolean;
}) => {
  const borderCls = member.is_self
    ? 'border-primary/70 bg-primary/10 shadow-[0_0_12px_rgba(124,58,237,0.4)]'
    : RELATION_COLORS[member.relation] ?? RELATION_COLORS.default;
  const sideCls = member.side ? SIDE_ACCENT[member.side] ?? '' : '';
  const closenessCls = closenessRing(member.closeness);

  return (
    <button
      type="button"
      onClick={() => onClick?.(member)}
      className={`flex flex-col items-center gap-1 group ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
      title={`${member.name} — ${member.relation_label}`}
    >
      {/* Avatar */}
      <div className={`rounded-full border-2 ${borderCls} ${sideCls} ${closenessCls} overflow-hidden flex items-center justify-center transition-transform group-hover:scale-105 ${compact ? 'w-10 h-10' : 'w-12 h-12 sm:w-14 sm:h-14'}`}>
        {member.avatar_url ? (
          <img src={member.avatar_url} alt={member.name} className="w-full h-full object-cover" />
        ) : member.is_self ? (
          <User className={`${compact ? 'h-5 w-5' : 'h-6 w-6'} text-primary`} />
        ) : (
          <span className={`font-bold text-white/70 ${compact ? 'text-xs' : 'text-sm'}`}>
            {member.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
          </span>
        )}
      </div>

      {/* Name */}
      <div className="text-center max-w-[72px]">
        <p className={`font-medium text-white/90 leading-tight truncate ${compact ? 'text-[9px]' : 'text-[10px] sm:text-xs'}`}>
          {member.first_name ?? member.name.split(' ')[0]}
        </p>
        <p className={`text-white/40 leading-tight truncate ${compact ? 'text-[8px]' : 'text-[9px]'}`}>
          {member.relation_label}
        </p>
        {member.deceased && (
          <p className="text-[8px] text-white/25 italic">†</p>
        )}
      </div>
    </button>
  );
};

// Generation row header
const GenHeader = ({ label, generation }: { label: string; generation: number }) => (
  <div className="flex items-center gap-2 mb-3">
    <div className="h-px flex-1 bg-white/8" />
    <span className="text-[9px] font-semibold text-white/25 uppercase tracking-widest px-1">{label}</span>
    <div className="h-px flex-1 bg-white/8" />
  </div>
);

const GEN_LABELS: Record<number, string> = {
  [-3]: 'Great-Grandparents',
  [-2]: 'Grandparents',
  [-1]: 'Parents',
  [0]:  'Your Generation',
  [1]:  'Children',
  [2]:  'Grandchildren',
};

export const FamilyTreeView = ({ tree, onMemberClick, compact = false }: FamilyTreeViewProps) => {
  const { members } = tree;

  // Group by generation
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
    <div className="space-y-5">
      {/* Legend */}
      {!compact && tree.branches.length > 0 && (
        <div className="flex flex-wrap gap-2">
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

        // For gen 0 (self + siblings + cousins + spouse), highlight self
        const self = gMembers.find(m => m.is_self);
        const others = gMembers.filter(m => !m.is_self);

        return (
          <div key={gen}>
            <GenHeader label={label} generation={gen} />
            <div className={`flex flex-wrap justify-center gap-3 sm:gap-4 ${gen === 0 ? 'items-start' : ''}`}>
              {/* Self always centered in gen 0 */}
              {self && (
                <div className="flex flex-col items-center">
                  <PersonNode member={self} onClick={onMemberClick} compact={compact} />
                  {!compact && (
                    <span className="text-[8px] text-primary/60 mt-0.5 font-semibold uppercase tracking-widest">You</span>
                  )}
                </div>
              )}
              {others.map(m => (
                <PersonNode key={m.id} member={m} onClick={onMemberClick} compact={compact} />
              ))}
            </div>
          </div>
        );
      })}

      {/* Relationship legend at bottom */}
      {!compact && (
        <div className="pt-2 border-t border-white/8 flex flex-wrap gap-x-4 gap-y-1">
          {[
            { color: 'bg-violet-400', label: 'Parent / Grandparent' },
            { color: 'bg-cyan-400', label: 'Sibling' },
            { color: 'bg-rose-400', label: 'Partner' },
            { color: 'bg-teal-400', label: 'Cousin' },
            { color: 'bg-amber-400', label: 'Aunt / Uncle' },
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

// ── Mock family tree factory ───────────────────────────────────────────────────
// Used in demo mode. Builds a rich family tree for the main user.

export const createMockUserFamilyTree = (): FamilyTree => ({
  self_id: 'self',
  branches: [
    { side: 'paternal', label: "Mendoza (Dad's side)", color: '#60a5fa' },
    { side: 'maternal', label: "Chen (Mom's side)",    color: '#f472b6' },
    { side: 'partner',  label: 'Partner side',         color: '#34d399' },
  ],
  members: [
    // Self
    { id: 'self', name: 'You', relation: 'related', relation_label: 'You', generation: 0, is_self: true },

    // Parents
    { id: 'dad',  name: 'Roberto Mendoza', first_name: 'Roberto', relation: 'parent',  relation_label: 'Dad',  generation: -1, birth_year: 1966, side: 'paternal', closeness: 72 },
    { id: 'mom',  name: 'Elena Chen-Mendoza', first_name: 'Elena', relation: 'parent', relation_label: 'Mom',  generation: -1, birth_year: 1969, side: 'maternal', closeness: 81 },

    // Siblings
    { id: 'jordan', name: 'Jordan Kim', first_name: 'Jordan', relation: 'half_sibling', relation_label: 'Half-sibling', generation: 0, side: 'maternal', closeness: 93, notes: 'Same mother, different father (David Kim)' },

    // Grandparents — Paternal
    { id: 'gpa-m', name: 'Miguel Mendoza', first_name: 'Miguel', relation: 'grandparent', relation_label: 'Grandpa', generation: -2, birth_year: 1938, side: 'paternal', deceased: true },
    { id: 'gma-m', name: 'Carmen Mendoza', first_name: 'Carmen', relation: 'grandparent', relation_label: 'Grandma', generation: -2, birth_year: 1942, side: 'paternal', closeness: 65 },

    // Grandparents — Maternal
    { id: 'gpa-c', name: 'James Chen', first_name: 'James', relation: 'grandparent', relation_label: 'Grandpa', generation: -2, birth_year: 1944, side: 'maternal', closeness: 58 },
    { id: 'gma-c', name: 'Susan Chen', first_name: 'Susan', relation: 'grandparent', relation_label: 'Grandma', generation: -2, birth_year: 1947, side: 'maternal', closeness: 61 },

    // Aunt / Uncle — Maternal side
    { id: 'uncle-dc', name: 'David Chen', first_name: 'David', relation: 'uncle', relation_label: 'Uncle', generation: -1, birth_year: 1972, side: 'maternal', closeness: 45 },

    // Cousins
    { id: 'zoe', name: 'Zoe Chen', first_name: 'Zoe', relation: 'cousin', relation_label: 'Cousin', generation: 0, side: 'maternal', closeness: 88 },

    // Partner (Alex)
    { id: 'alex-gf', name: 'Alex', first_name: 'Alex', relation: 'spouse', relation_label: 'Partner', generation: 0, side: 'partner', closeness: 99 },
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
        { id: 'jordan', name: 'Jordan Kim', first_name: 'Jordan', relation: 'related', relation_label: 'Jordan', generation: 0, is_self: true },
        { id: 'mom-shared', name: 'Elena Chen-Mendoza', first_name: 'Elena', relation: 'parent', relation_label: 'Mom (shared)', generation: -1, side: 'maternal' },
        { id: 'dad-kim',    name: 'David Kim',          first_name: 'David', relation: 'parent', relation_label: 'Dad',           generation: -1, side: 'paternal' },
        { id: 'self-ref',   name: 'You',                first_name: 'You',   relation: 'half_sibling', relation_label: 'Half-sibling', generation: 0, side: 'maternal' },
        { id: 'gma-kim',    name: 'Soon-hee Kim',       first_name: 'Soon-hee', relation: 'grandparent', relation_label: 'Grandma', generation: -2, side: 'paternal' },
        { id: 'gpa-kim',    name: 'Jin-woo Kim',        first_name: 'Jin-woo',  relation: 'grandparent', relation_label: 'Grandpa', generation: -2, side: 'paternal' },
      ],
    },
    'Zoe Chen': {
      self_id: 'zoe',
      branches: [
        { side: 'paternal', label: 'Chen side (shared w/ you)', color: '#f472b6' },
        { side: 'other',    label: 'Wong side',                 color: '#fbbf24' },
      ],
      members: [
        { id: 'zoe',       name: 'Zoe Chen',          first_name: 'Zoe',      relation: 'related',    relation_label: 'Zoe',      generation: 0,  is_self: true },
        { id: 'dad-chen',  name: 'David Chen',        first_name: 'David',    relation: 'parent',     relation_label: 'Dad',      generation: -1, side: 'paternal' },
        { id: 'mom-wong',  name: 'Patricia Wong-Chen', first_name: 'Patricia', relation: 'parent',    relation_label: 'Mom',      generation: -1, side: 'other' },
        { id: 'self-ref',  name: 'You',               first_name: 'You',      relation: 'cousin',     relation_label: 'Cousin',   generation: 0,  side: 'paternal' },
        { id: 'gpa-c-s',   name: 'James Chen',        first_name: 'James',    relation: 'grandparent', relation_label: 'Grandpa (shared)', generation: -2, side: 'paternal' },
        { id: 'gma-c-s',   name: 'Susan Chen',        first_name: 'Susan',    relation: 'grandparent', relation_label: 'Grandma (shared)', generation: -2, side: 'paternal' },
      ],
    },
  };
  return trees[characterName] ?? null;
};
