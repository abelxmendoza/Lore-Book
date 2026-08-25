import { describe, expect, it } from 'vitest';
import { buildTreeFromEdges } from '../../src/services/familyTreeService';

type Edge = { fromId: string; toId: string; type: string; confidence: number; evidence?: string };

/** The BFS/composer entry point — pure and synchronous, no Supabase calls
 *  inside it, so no DB mocking is needed to exercise it. */
function buildTree(
  rootId: string,
  rootName: string,
  edges: Edge[],
  names: Map<string, string>,
  opts: { markSelf?: boolean; selfId?: string; restrictIds?: Set<string> } = {},
  sexHints: Map<string, 'male' | 'female'> = new Map(),
) {
  return buildTreeFromEdges(rootId, rootName, edges, names, opts, sexHints);
}

describe('familyTreeService — multi-hop relation composition (regression for the aunt/uncle & cousin mislabel bug)', () => {
  it('labels a parent-sibling correctly as aunt/uncle instead of sibling, using a name-based sex guess', () => {
    const names = new Map([
      ['you', 'You'],
      ['mom', 'Linda'],
      ['auntuncle', 'Michael'], // confident male name, no kinship title, no metadata.sex
    ]);
    const edges: Edge[] = [
      { fromId: 'mom', toId: 'you', type: 'parent_of', confidence: 1 },
      { fromId: 'mom', toId: 'auntuncle', type: 'sibling_of', confidence: 1 },
    ];

    const tree = buildTree('you', 'You', edges, names, { markSelf: true, selfId: 'you' });

    const auntUncle = tree.members.find((m: any) => m.id === 'auntuncle');
    expect(auntUncle.relation).toBe('uncle');
    expect(auntUncle.relation).not.toBe('sibling');
  });

  it('labels a parent-sibling-child correctly as cousin instead of parent', () => {
    const names = new Map([
      ['you', 'You'],
      ['mom', 'Linda'],
      ['auntuncle', 'Sarah'],
      ['cousin', 'Casey'], // unisex name — irrelevant here, cousin is sex-independent
    ]);
    const edges: Edge[] = [
      { fromId: 'mom', toId: 'you', type: 'parent_of', confidence: 1 },
      { fromId: 'mom', toId: 'auntuncle', type: 'sibling_of', confidence: 1 },
      { fromId: 'auntuncle', toId: 'cousin', type: 'parent_of', confidence: 1 },
    ];

    const tree = buildTree('you', 'You', edges, names, { markSelf: true, selfId: 'you' });

    const auntUncle = tree.members.find((m: any) => m.id === 'auntuncle');
    const cousin = tree.members.find((m: any) => m.id === 'cousin');
    expect(auntUncle.relation).toBe('aunt');
    expect(cousin.relation).toBe('cousin');
    expect(cousin.relation).not.toBe('parent');
  });

  it('prefers an explicit metadata sex hint over a name guess', () => {
    const names = new Map([
      ['you', 'You'],
      ['mom', 'Linda'],
      ['auntuncle', 'Michael'], // name says male...
    ]);
    const edges: Edge[] = [
      { fromId: 'mom', toId: 'you', type: 'parent_of', confidence: 1 },
      { fromId: 'mom', toId: 'auntuncle', type: 'sibling_of', confidence: 1 },
    ];
    // ...but a stronger, already-known sex signal says female (e.g. from a kinship title elsewhere).
    const sexHints = new Map<string, 'male' | 'female'>([['auntuncle', 'female']]);

    const tree = buildTree('you', 'You', edges, names, { markSelf: true, selfId: 'you' }, sexHints);

    expect(tree.members.find((m: any) => m.id === 'auntuncle').relation).toBe('aunt');
  });

  it('falls back to "related" honestly instead of guessing when sex cannot be determined', () => {
    const names = new Map([
      ['you', 'You'],
      ['mom', 'Linda'],
      ['auntuncle', 'Jordan'], // explicitly unisex — sexFromFirstName returns null
    ]);
    const edges: Edge[] = [
      { fromId: 'mom', toId: 'you', type: 'parent_of', confidence: 1 },
      { fromId: 'mom', toId: 'auntuncle', type: 'sibling_of', confidence: 1 },
    ];

    const tree = buildTree('you', 'You', edges, names, { markSelf: true, selfId: 'you' });

    expect(tree.members.find((m: any) => m.id === 'auntuncle').relation).toBe('related');
  });

  it('still resolves direct relations (parent, grandparent, sibling) unchanged', () => {
    const names = new Map([
      ['you', 'You'],
      ['mom', 'Linda'],
      ['grandma', 'Rosa'],
      ['sib', 'Alex'],
    ]);
    const edges: Edge[] = [
      { fromId: 'mom', toId: 'you', type: 'parent_of', confidence: 1 },
      { fromId: 'grandma', toId: 'mom', type: 'parent_of', confidence: 1 },
      { fromId: 'mom', toId: 'sib', type: 'parent_of', confidence: 1 },
    ];

    const tree = buildTree('you', 'You', edges, names, { markSelf: true, selfId: 'you' });

    expect(tree.members.find((m: any) => m.id === 'mom').relation).toBe('parent');
    expect(tree.members.find((m: any) => m.id === 'grandma').relation).toBe('grandparent');
    expect(tree.members.find((m: any) => m.id === 'sib').relation).toBe('sibling');
  });

  it('leaves compound/explicit edge types (e.g. step_parent_of) exactly as they were', () => {
    const names = new Map([
      ['you', 'You'],
      ['stepdad', 'Ben'],
    ]);
    const edges: Edge[] = [{ fromId: 'stepdad', toId: 'you', type: 'step_parent_of', confidence: 1 }];

    const tree = buildTree('you', 'You', edges, names, { markSelf: true, selfId: 'you' });

    expect(tree.members.find((m: any) => m.id === 'stepdad').relation).toBe('step_parent');
  });
});

describe('familyTreeService — generation direction (regression for the Abuela-in-the-wrong-row bug)', () => {
  // A relationship commonly gets persisted as two separate rows, one from each
  // side (you --grandchild_of--> Abuela, AND Abuela --grandparent_of--> you) —
  // both already correctly typed from their own fromId's perspective. The bug:
  // generation used to be computed by re-matching *any* edge between the two
  // node ids (ignoring which of the two rows a given traversal actually came
  // from), so when both rows existed, whichever one the lookup happened to
  // find first silently decided the direction — sometimes right, sometimes
  // backwards, depending on array order alone. This pins that down: no matter
  // which row comes first in the input, the answer must be the same.
  it('computes the same, correct generation for a grandparent regardless of which of the two directional edge rows comes first', () => {
    const names = new Map([
      ['you', 'You'],
      ['grandma', 'Abuela'],
    ]);
    const forward: Edge = { fromId: 'you', toId: 'grandma', type: 'grandchild_of', confidence: 1 };
    const backward: Edge = { fromId: 'grandma', toId: 'you', type: 'grandparent_of', confidence: 1 };

    const treeA = buildTree('you', 'You', [forward, backward], names, { markSelf: true, selfId: 'you' });
    const treeB = buildTree('you', 'You', [backward, forward], names, { markSelf: true, selfId: 'you' });

    expect(treeA.members.find((m: any) => m.id === 'grandma').generation).toBe(-2);
    expect(treeB.members.find((m: any) => m.id === 'grandma').generation).toBe(-2);
  });

  it('computes the same, correct generation for a parent regardless of which of the two directional edge rows comes first', () => {
    const names = new Map([
      ['you', 'You'],
      ['mom', 'Mom'],
    ]);
    const forward: Edge = { fromId: 'you', toId: 'mom', type: 'child_of', confidence: 1 };
    const backward: Edge = { fromId: 'mom', toId: 'you', type: 'parent_of', confidence: 1 };

    const treeA = buildTree('you', 'You', [forward, backward], names, { markSelf: true, selfId: 'you' });
    const treeB = buildTree('you', 'You', [backward, forward], names, { markSelf: true, selfId: 'you' });

    expect(treeA.members.find((m: any) => m.id === 'mom').generation).toBe(-1);
    expect(treeB.members.find((m: any) => m.id === 'mom').generation).toBe(-1);
  });
});
