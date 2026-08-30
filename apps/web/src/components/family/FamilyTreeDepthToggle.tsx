import type { FamilyTree } from '../../types/socialRoles';
import {
  familyTreeDepthCounts,
  type FamilyTreeDepth,
} from '../../lib/familyTreeDepth';

type Props = {
  value: FamilyTreeDepth;
  onChange: (next: FamilyTreeDepth) => void;
  tree: FamilyTree;
};

export function FamilyTreeDepthToggle({ value, onChange, tree }: Props) {
  const counts = familyTreeDepthCounts(tree);

  return (
    <div data-testid="family-tree-depth-toggle" className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid="family-tree-depth-close"
          aria-pressed={value === 'close'}
          onClick={() => onChange('close')}
          className={`text-xs px-3 py-1.5 rounded-lg border ${
            value === 'close'
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
              : 'border-white/10 text-white/50 hover:text-white/80'
          }`}
        >
          Close family
          <span className="ml-1.5 font-normal text-white/35">{counts.close}</span>
        </button>
        <button
          type="button"
          data-testid="family-tree-depth-full"
          aria-pressed={value === 'full'}
          onClick={() => onChange('full')}
          className={`text-xs px-3 py-1.5 rounded-lg border ${
            value === 'full'
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
              : 'border-white/10 text-white/50 hover:text-white/80'
          }`}
        >
          Full tree
          <span className="ml-1.5 font-normal text-white/35">{counts.full}</span>
        </button>
      </div>
      <p className="text-[11px] text-white/40">
        {value === 'close'
          ? 'Parents, siblings, partner, and kids. Open Full tree for grandparents, cousins, and the rest.'
          : 'Everyone on this tree — grandparents, aunts and uncles, cousins, in-laws.'}
      </p>
    </div>
  );
}
