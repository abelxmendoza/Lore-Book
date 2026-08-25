import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  isSyntheticNodeId,
  isFamilyExcluded,
  assessNodeReview,
  applyRelationOverride,
  projectSharedFamilyTreeOntoEgo,
  projectAffinityFamilyTreeOntoEgo,
  isAffinityKinOnSharedTree,
  collectAbsoluteParentChildEdges,
  inferSiblingAndInverseParentEdges,
  inverseFamilyEdgeType,
  resolveFamilyEdgeDirection,
  dropContradictoryAscendingEdges,
  alignMarriedInSidesWithSpouse,
  sortFamilyMembersForDisplay,
  familyTreeService,
  characterHasFamilyTreeSignal,
  isFamilyTreeEligibleCharacter,
  resolveRawKinshipType,
  type FamilyMemberDTO,
  type FamilyTreeDTO,
  type CharacterKinshipRow,
} from '../../src/services/familyTreeService';

function member(overrides: Partial<FamilyMemberDTO> = {}): FamilyMemberDTO {
  return {
    id: 'char-1',
    name: 'Grace Rivera',
    relation: 'related',
    relation_label: 'Relative',
    generation: 0,
    ...overrides,
  };
}

describe('familyTreeService — node identity helpers', () => {
  it('flags synthetic (non-character) node ids', () => {
    expect(isSyntheticNodeId('__user__')).toBe(true);
    expect(isSyntheticNodeId('__inferred_parent_unknown__')).toBe(true);
    expect(isSyntheticNodeId('name-3')).toBe(true);
    expect(isSyntheticNodeId('head-x')).toBe(true);
    expect(isSyntheticNodeId('group-y')).toBe(true);
    expect(isSyntheticNodeId('b1c2-uuid-real')).toBe(false);
  });

  it('detects the family_excluded flag in both shapes', () => {
    expect(isFamilyExcluded({ family_excluded: { value: true } })).toBe(true);
    expect(isFamilyExcluded({ family_excluded: true })).toBe(true);
    expect(isFamilyExcluded({ family_excluded: { value: false } })).toBe(false);
    expect(isFamilyExcluded({})).toBe(false);
    expect(isFamilyExcluded(null)).toBe(false);
    expect(isFamilyExcluded(undefined)).toBe(false);
  });
});

function kinRow(overrides: Partial<CharacterKinshipRow> = {}): CharacterKinshipRow {
  return {
    id: 'char-1',
    name: 'Jamie',
    ...overrides,
  };
}

describe('familyTreeService — Family Book alignment', () => {
  it('admits titled kin and an explicit cousin role', () => {
    expect(characterHasFamilyTreeSignal(kinRow({ name: 'Tía Maya', archetype: 'family' }))).toBe(true);
    expect(characterHasFamilyTreeSignal(kinRow({ name: 'Jamie', role: 'cousin' }))).toBe(true);
    expect(isFamilyTreeEligibleCharacter(kinRow({ name: 'Tía Maya', archetype: 'family' }))).toBe(true);
  });

  it('does not admit a generic family stamp or a crush archetype', () => {
    expect(
      characterHasFamilyTreeSignal(
        kinRow({
          name: 'Alex',
          archetype: 'family',
          metadata: { relationship_type: 'family' },
        }),
      ),
    ).toBe(false);
    expect(
      isFamilyTreeEligibleCharacter(
        kinRow({
          name: 'Renna',
          archetype: 'unrequited_crush',
          metadata: { relationship_type: 'family' },
        }),
      ),
    ).toBe(false);
  });

  it('admits a user Family pin and rejects a not-family pin', () => {
    expect(
      characterHasFamilyTreeSignal(
        kinRow({
          name: 'Alex',
          metadata: { book_category: 'family', book_category_source: 'user_confirmed' },
        }),
      ),
    ).toBe(true);
    expect(
      isFamilyTreeEligibleCharacter(
        kinRow({
          name: 'Alex',
          metadata: { book_category: 'friends', book_category_source: 'user_confirmed' },
        }),
      ),
    ).toBe(false);
  });

  it('respects family_excluded over a Family pin', () => {
    expect(
      isFamilyTreeEligibleCharacter(
        kinRow({
          name: 'Tía Maya',
          metadata: {
            book_category: 'family',
            book_category_source: 'user_confirmed',
            family_excluded: { value: true, reason: 'tree_remove' },
          },
        }),
      ),
    ).toBe(false);
  });
});

describe('familyTreeService — assessNodeReview', () => {
  it('flags handle / stage-name shapes', () => {
    const r = assessNodeReview(member({ name: 'Oscuri.dad', relation: 'parent' }));
    expect(r?.needsReview).toBe(true);
    expect(r?.reason).toMatch(/handle or stage name/i);
  });

  it('flags marked public figures', () => {
    const r = assessNodeReview(member({ name: 'Some Artist', relation: 'parent' }), {
      metadata: { public_figure: true },
    });
    expect(r?.needsReview).toBe(true);
    expect(r?.reason).toMatch(/public figure/i);
  });

  it('does not flag figure_type=creator alone (product creator overload)', () => {
    expect(
      assessNodeReview(member({ name: 'Marcus', relation: 'cousin' }), {
        metadata: { figure_type: 'creator' },
      }),
    ).toBeNull();
  });

  it('never flags the account protagonist on another ego tree', () => {
    expect(
      assessNodeReview(
        member({ id: 'you', name: 'Abel Mendoza', relation: 'related' }),
        { metadata: { figure_type: 'creator' } },
        { accountSelfId: 'you' },
      ),
    ).toBeNull();
    expect(
      assessNodeReview(member({ id: 'you', name: 'Abel Mendoza', relation: 'related' }), {
        metadata: { is_self: true },
      }),
    ).toBeNull();
  });

  it('flags a trailing (non-leading) kinship word as a nickname', () => {
    const r = assessNodeReview(member({ name: 'Goth Tio', relation: 'uncle' }));
    expect(r?.needsReview).toBe(true);
    expect(r?.reason).toMatch(/not at the start/i);
  });

  it('does NOT flag real title-leading kin', () => {
    expect(assessNodeReview(member({ name: 'Tía Grace', relation: 'aunt' }))).toBeNull();
    expect(assessNodeReview(member({ name: 'Abuela', relation: 'grandparent' }))).toBeNull();
  });

  it('flags a generic relative with no kinship signal', () => {
    const r = assessNodeReview(member({ name: 'Jordan Park', relation: 'related' }));
    expect(r?.needsReview).toBe(true);
    expect(r?.reason).toMatch(/no clear family relationship/i);
  });

  it('never flags self, placeholders, or already-reviewed nodes', () => {
    expect(assessNodeReview(member({ name: 'Oscuri.dad', is_self: true }))).toBeNull();
    expect(assessNodeReview(member({ name: 'Oscuri.dad', is_placeholder: true }))).toBeNull();
    expect(assessNodeReview(member({ name: 'Goth Tio', relation: 'uncle' }), { metadata: { family_reviewed: true } })).toBeNull();
  });
});

describe('familyTreeService — applyRelationOverride', () => {
  it('repositions generation and marks asserted', () => {
    const out = applyRelationOverride(member({ relation: 'related', generation: 0 }), {
      relation: 'aunt',
      side: 'maternal',
    });
    expect(out.relation).toBe('aunt');
    expect(out.generation).toBe(-1);
    expect(out.side).toBe('maternal');
    expect(out.inference_status).toBe('asserted');
  });
});

describe('familyTreeService — bidirectional + shared projection', () => {
  it('inverts parent_of to child_of', () => {
    expect(inverseFamilyEdgeType('parent_of')).toBe('child_of');
    expect(inverseFamilyEdgeType('child_of')).toBe('parent_of');
    expect(inverseFamilyEdgeType('sibling_of')).toBe('sibling_of');
  });

  it('infers sibling edges from shared parents and writes child_of inverses', () => {
    const extra = inferSiblingAndInverseParentEdges([
      { fromId: 'aunt', toId: 'james', type: 'parent_of', confidence: 1 },
      { fromId: 'aunt', toId: 'jerry', type: 'parent_of', confidence: 1 },
    ]);
    expect(extra.some((e) => e.fromId === 'james' && e.toId === 'aunt' && e.type === 'child_of')).toBe(true);
    expect(extra.some((e) => e.fromId === 'james' && e.toId === 'jerry' && e.type === 'sibling_of')).toBe(true);
    expect(extra.some((e) => e.fromId === 'jerry' && e.toId === 'james' && e.type === 'sibling_of')).toBe(true);
  });

  it('projects the shared user tree onto a cousin with the same member roster', () => {
    const shared: FamilyTreeDTO = {
      self_id: 'you',
      branches: [{ side: 'maternal', label: 'Maternal', color: '#f472b6' }],
      members: [
        member({ id: 'you', name: 'Marcus', relation: 'related', relation_label: 'You', generation: 0, is_self: true }),
        member({ id: 'mom', name: 'Mom', kinship_title: 'Mother', relation: 'parent', relation_label: 'Mother', generation: -1, side: 'maternal' }),
        member({ id: 'grace', name: 'Tía Grace', kinship_title: 'Aunt', relation: 'aunt', relation_label: 'Aunt', generation: -1, side: 'maternal' }),
        member({
          id: 'james',
          name: 'James',
          relation: 'cousin',
          relation_label: 'Cousin',
          generation: 0,
          side: 'maternal',
          parent_id: 'grace',
          inference_status: 'asserted',
        }),
        member({
          id: 'jerry',
          name: 'Jerry',
          relation: 'cousin',
          relation_label: 'Cousin',
          generation: 0,
          side: 'maternal',
          parent_id: 'grace',
          inference_status: 'asserted',
        }),
      ],
    };

    expect(collectAbsoluteParentChildEdges(shared)).toEqual(
      expect.arrayContaining([
        { parentId: 'mom', childId: 'you' },
        { parentId: 'grace', childId: 'james' },
        { parentId: 'grace', childId: 'jerry' },
      ]),
    );

    const ontoJames = projectSharedFamilyTreeOntoEgo(shared, 'james');
    expect(ontoJames.self_id).toBe('james');
    expect(ontoJames.members.map((m) => m.id).sort()).toEqual(shared.members.map((m) => m.id).sort());
    expect(ontoJames.members.find((m) => m.id === 'james')?.is_self).toBe(true);
    expect(ontoJames.members.find((m) => m.id === 'grace')?.relation).toBe('parent');
    expect(ontoJames.members.find((m) => m.id === 'jerry')?.relation).toBe('sibling');
    expect(ontoJames.members.find((m) => m.id === 'james')?.parent_id).toBe('grace');
    // Account owner stays cousin (not vague "related") and is tagged as you.
    const youOnJames = ontoJames.members.find((m) => m.id === 'you')!;
    expect(youOnJames.is_self).toBe(false);
    expect(youOnJames.is_account_self).toBe(true);
    expect(youOnJames.relation).toBe('cousin');
    expect(youOnJames.needs_review).toBeFalsy();
  });

  it('re-roots an uncle tree on the same absolute graph without making the account owner his child', () => {
    const shared: FamilyTreeDTO = {
      self_id: 'marcus',
      branches: [{ side: 'maternal', label: 'Maternal', color: '#f472b6' }],
      members: [
        member({
          id: 'marcus',
          name: 'Marcus',
          relation: 'related',
          relation_label: 'You',
          generation: 0,
          is_self: true,
        }),
        member({
          id: 'grandmother',
          name: 'Grandmother',
          relation: 'parent',
          relation_label: 'Grandparent',
          generation: -1,
          side: 'maternal',
        }),
        member({
          id: 'mother',
          name: 'Mom (Morgan)',
          kinship_title: 'Mother',
          relation: 'related',
          relation_label: 'Mother',
          generation: 0,
          side: 'maternal',
        }),
        member({
          id: 'uncle',
          name: 'Uncle Jordan',
          relation: 'uncle',
          relation_label: 'Uncle',
          generation: -1,
          side: 'maternal',
          parent_id: 'grandmother',
        }),
        member({
          id: 'aunt',
          name: 'Aunt Taylor',
          relation: 'aunt',
          relation_label: 'Aunt',
          generation: 2,
          side: 'maternal',
        }),
        member({
          id: 'jamie',
          name: 'Jamie',
          relation: 'cousin',
          relation_label: 'Cousin',
          generation: 0,
          side: 'maternal',
          parent_id: 'aunt',
        }),
      ],
    };

    const absolute = collectAbsoluteParentChildEdges(shared);
    expect(absolute).toEqual(
      expect.arrayContaining([
        { parentId: 'grandmother', childId: 'uncle' },
        { parentId: 'grandmother', childId: 'mother' },
        { parentId: 'grandmother', childId: 'aunt' },
        { parentId: 'mother', childId: 'marcus' },
        { parentId: 'aunt', childId: 'jamie' },
      ]),
    );
    expect(absolute).not.toContainEqual({ parentId: 'grandmother', childId: 'marcus' });
    expect(absolute).not.toContainEqual({ parentId: 'uncle', childId: 'marcus' });

    const ontoUncle = projectSharedFamilyTreeOntoEgo(shared, 'uncle');
    expect(ontoUncle.members.find((m) => m.id === 'grandmother')).toMatchObject({
      relation: 'parent',
      relation_label: 'Parent',
      generation: -1,
    });
    expect(ontoUncle.members.find((m) => m.id === 'mother')).toMatchObject({
      relation: 'sibling',
      relation_label: 'Sibling',
      generation: 0,
      parent_id: 'grandmother',
    });
    expect(ontoUncle.members.find((m) => m.id === 'aunt')).toMatchObject({
      relation: 'sibling',
      relation_label: 'Sibling',
      generation: 0,
      parent_id: 'grandmother',
    });
    expect(ontoUncle.members.find((m) => m.id === 'marcus')).toMatchObject({
      relation: 'niece',
      relation_label: 'Niece / nephew',
      generation: 1,
      parent_id: 'mother',
      is_account_self: true,
    });
    expect(ontoUncle.members.find((m) => m.id === 'jamie')).toMatchObject({
      relation: 'niece',
      relation_label: 'Niece / nephew',
      generation: 1,
      parent_id: 'aunt',
    });
  });

  it('scopes step-parent ego trees to partner + shared child, not blood relatives', () => {
    const shared: FamilyTreeDTO = {
      self_id: 'you',
      branches: [{ side: 'maternal', label: 'Maternal', color: '#f472b6' }],
      members: [
        member({ id: 'you', name: 'Marcus', relation: 'related', relation_label: 'You', generation: 0, is_self: true }),
        member({
          id: 'mom',
          name: 'Mom',
          kinship_title: 'Mother',
          relation: 'parent',
          relation_label: 'Mother',
          generation: -1,
          side: 'maternal',
        }),
        member({
          id: 'ben',
          name: 'Step Dad Ben',
          kinship_title: 'Step-father',
          relation: 'step_parent',
          relation_label: 'Step-father',
          generation: -1,
          side: 'paternal',
        }),
        member({
          id: 'abuela',
          name: 'Abuela',
          relation: 'grandparent',
          relation_label: 'Grandparent',
          generation: -2,
          side: 'maternal',
        }),
        member({
          id: 'grace',
          name: 'Tía Grace',
          relation: 'aunt',
          relation_label: 'Aunt',
          generation: -1,
          side: 'maternal',
        }),
        member({
          id: 'james',
          name: 'James',
          relation: 'cousin',
          relation_label: 'Cousin',
          generation: 0,
          side: 'maternal',
          parent_id: 'grace',
        }),
      ],
    };

    expect(isAffinityKinOnSharedTree(shared.members.find((m) => m.id === 'ben')!)).toBe(true);
    expect(isAffinityKinOnSharedTree(shared.members.find((m) => m.id === 'grace')!)).toBe(false);

    const ontoBen = projectAffinityFamilyTreeOntoEgo(shared, 'ben');
    const ids = ontoBen.members.map((m) => m.id).sort();
    expect(ids).toEqual(['ben', 'mom', 'you'].sort());
    expect(ontoBen.members.find((m) => m.id === 'ben')?.is_self).toBe(true);
    expect(ontoBen.members.find((m) => m.id === 'mom')?.relation).toBe('spouse');
    expect(ontoBen.members.find((m) => m.id === 'you')?.relation).toBe('step_child');
    expect(ontoBen.members.some((m) => m.id === 'abuela')).toBe(false);
    expect(ontoBen.members.some((m) => m.id === 'james')).toBe(false);
  });
});

describe('familyTreeService — resolveFamilyEdgeDirection', () => {
  // Reproduces a real bug: an aunt stored as a generic "family" row with
  // metadata.kinship='aunt', written as (root -> aunt) instead of the
  // convention every typed edge follows (aunt -> root, e.g. Mom parent_of
  // You). Left unflipped, BFS generation math placed the aunt one
  // generation BELOW the user instead of above.
  it('flips a backwards generic-family aunt edge so root is the target', () => {
    const { fromId, toId } = resolveFamilyEdgeDirection('root', 'root', 'aunt-1', 'family', 'aunt_of');
    expect(fromId).toBe('aunt-1');
    expect(toId).toBe('root');
  });

  it('flips a backwards generic-family parent edge so root is the target', () => {
    const { fromId, toId } = resolveFamilyEdgeDirection('root', 'root', 'mom-1', 'related_to', 'parent_of');
    expect(fromId).toBe('mom-1');
    expect(toId).toBe('root');
  });

  it('leaves an already-correct aunt_of edge alone (aunt is the source)', () => {
    const { fromId, toId } = resolveFamilyEdgeDirection('root', 'aunt-1', 'root', 'aunt_of', 'aunt_of');
    expect(fromId).toBe('aunt-1');
    expect(toId).toBe('root');
  });

  it('leaves a properly-typed generic-family aunt edge alone when root is the target already', () => {
    const { fromId, toId } = resolveFamilyEdgeDirection('root', 'aunt-1', 'root', 'family', 'aunt_of');
    expect(fromId).toBe('aunt-1');
    expect(toId).toBe('root');
  });

  it('does not flip symmetric relations (cousin, sibling, spouse) even when root is the source', () => {
    expect(resolveFamilyEdgeDirection('root', 'root', 'cousin-1', 'family', 'cousin_of')).toEqual({
      fromId: 'root',
      toId: 'cousin-1',
    });
    expect(resolveFamilyEdgeDirection('root', 'root', 'sib-1', 'family', 'sibling_of')).toEqual({
      fromId: 'root',
      toId: 'sib-1',
    });
  });

  it('does not flip descending relations (root reporting their own child) even from a generic bucket', () => {
    const { fromId, toId } = resolveFamilyEdgeDirection('root', 'root', 'kid-1', 'family', 'child_of');
    expect(fromId).toBe('root');
    expect(toId).toBe('kid-1');
  });

  it('does not flip an ascending relation when the row already has a real (non-generic) type', () => {
    // A genuinely mistyped 'aunt_of' row with root as source is a different,
    // out-of-scope data problem — only the ambiguous generic bucket is corrected.
    const { fromId, toId } = resolveFamilyEdgeDirection('root', 'root', 'aunt-1', 'aunt_of', 'aunt_of');
    expect(fromId).toBe('root');
    expect(toId).toBe('aunt-1');
  });
});

describe('familyTreeService — alignMarriedInSidesWithSpouse', () => {
  // Reproduces a real request: a step-dad (married to Mom, maternal side)
  // whose own extraction evidence happened to tag him 'paternal' — putting
  // him in the wrong branch/ring even though he's confirmed spouse_of Mom.
  it('pulls a step-parent onto their spouse\'s side when a spouse_of edge connects them', () => {
    const mom = member({ id: 'mom', generation: -1, side: 'maternal', relation: 'parent' });
    const stepDad = member({ id: 'ben', generation: -1, side: 'paternal', relation: 'step_parent' });
    const members = [mom, stepDad];
    const edges = [{ fromId: 'ben', toId: 'mom', type: 'spouse_of' }];

    alignMarriedInSidesWithSpouse(members, edges);

    expect(stepDad.side).toBe('maternal');
    expect(mom.side).toBe('maternal');
  });

  it('does nothing when there is no spouse_of edge between them', () => {
    const mom = member({ id: 'mom', generation: -1, side: 'maternal', relation: 'parent' });
    const stepDad = member({ id: 'ben', generation: -1, side: 'paternal', relation: 'step_parent' });
    const members = [mom, stepDad];

    alignMarriedInSidesWithSpouse(members, []);

    expect(stepDad.side).toBe('paternal');
  });

  it('does not align across mismatched generations (spouse_of edge to the wrong tier)', () => {
    const grandma = member({ id: 'grandma', generation: -2, side: 'maternal', relation: 'grandparent' });
    const stepDad = member({ id: 'ben', generation: -1, side: 'paternal', relation: 'step_parent' });
    const members = [grandma, stepDad];
    const edges = [{ fromId: 'ben', toId: 'grandma', type: 'spouse_of' }];

    alignMarriedInSidesWithSpouse(members, edges);

    expect(stepDad.side).toBe('paternal');
  });

  it('leaves blood relations (parent, sibling, cousin, ...) untouched even with a spouse_of edge', () => {
    const mom = member({ id: 'mom', generation: -1, side: 'maternal', relation: 'parent' });
    const dad = member({ id: 'dad', generation: -1, side: 'paternal', relation: 'parent' });
    const members = [mom, dad];
    const edges = [{ fromId: 'mom', toId: 'dad', type: 'spouse_of' }];

    alignMarriedInSidesWithSpouse(members, edges);

    expect(mom.side).toBe('maternal');
    expect(dad.side).toBe('paternal');
  });

  it('records paired_with_id for a plain blood-relation couple (two grandparents), without touching side', () => {
    const abuela = member({ id: 'abuela', kinship_title: 'Abuela', generation: -2, side: 'maternal', relation: 'grandparent' });
    const abuelo = member({ id: 'abuelo', kinship_title: 'Abuelo', generation: -2, side: 'paternal', relation: 'grandparent' });
    const members = [abuela, abuelo];
    const edges = [{ fromId: 'abuela', toId: 'abuelo', type: 'spouse_of' }];

    alignMarriedInSidesWithSpouse(members, edges);

    expect(abuela.paired_with_id).toBe('abuelo');
    expect(abuelo.paired_with_id).toBe('abuela');
    // Neither is married-in, so side is left as-is, unlike the step-parent case.
    expect(abuela.side).toBe('maternal');
    expect(abuelo.side).toBe('paternal');
  });
});

describe('familyTreeService — dropContradictoryAscendingEdges (regression for the Abuela-in-the-wrong-row bug)', () => {
  // Reproduces a real bad-data case: a "You grandparent_of Abuela" row existed
  // alongside the correct "Abuela grandparent_of You" row — nobody is their
  // own ancestor's ancestor, so this is a straight contradiction, most likely
  // a bad row from an old/unknown write path rather than user error. Left
  // alone, GEN_DELTA['grandparent_of'].forward computes rootId's generation
  // math as if rootId really were the elder, landing Abuela at +2
  // ("grandchild") instead of -2.
  it('drops the row where rootId is asserted as the ascending party, when a contradicting row exists', () => {
    const edges = [
      { fromId: 'you', toId: 'grandma', type: 'grandparent_of', confidence: 0.75 },
      { fromId: 'grandma', toId: 'you', type: 'grandparent_of', confidence: 0.75 },
    ];

    const result = dropContradictoryAscendingEdges('you', edges);

    expect(result).toEqual([{ fromId: 'grandma', toId: 'you', type: 'grandparent_of', confidence: 0.75 }]);
  });

  it('leaves a legitimate rootId-as-elder edge alone when nothing contradicts it', () => {
    // rootId really can be the ascending party of someone in their own tree —
    // e.g. rootId's own child. No contradicting row exists here, so this
    // must not be touched.
    const edges = [{ fromId: 'you', toId: 'kid', type: 'parent_of', confidence: 0.75 }];

    const result = dropContradictoryAscendingEdges('you', edges);

    expect(result).toEqual(edges);
  });

  it('leaves non-ascending types (e.g. spouse_of, sibling_of) alone even when both directions exist', () => {
    // Both directions legitimately coexist for symmetric types — that's not
    // a contradiction, it's the normal bidirectional storage pattern.
    const edges = [
      { fromId: 'you', toId: 'partner', type: 'spouse_of', confidence: 0.75 },
      { fromId: 'partner', toId: 'you', type: 'spouse_of', confidence: 0.75 },
    ];

    const result = dropContradictoryAscendingEdges('you', edges);

    expect(result).toEqual(edges);
  });

  it('only drops rootId\'s own contradicting row, not one between two other people', () => {
    const edges = [
      { fromId: 'you', toId: 'grandma', type: 'grandparent_of', confidence: 0.75 },
      { fromId: 'grandma', toId: 'you', type: 'grandparent_of', confidence: 0.75 },
      { fromId: 'aunt', toId: 'cousin', type: 'aunt_of', confidence: 0.75 },
    ];

    const result = dropContradictoryAscendingEdges('you', edges);

    expect(result).toEqual([
      { fromId: 'grandma', toId: 'you', type: 'grandparent_of', confidence: 0.75 },
      { fromId: 'aunt', toId: 'cousin', type: 'aunt_of', confidence: 0.75 },
    ]);
  });
});

describe('familyTreeService — sortFamilyMembersForDisplay', () => {
  // Reproduces the real follow-up: side alone doesn't move anyone within a
  // generation row — the row is plain alphabetical by name. A step-dad whose
  // name alphabetizes far from Mom's (e.g. "Zach" vs "Ana") stayed same-row
  // but nowhere near her even after side was corrected. Pairing must be a
  // dedicated sort key, not a side effect of matching side.
  it('clusters a step-parent next to their spouse even when names sort far apart', () => {
    const mom = member({ id: 'mom', name: 'Ana Ortiz', generation: -1, side: 'maternal', relation: 'parent' });
    const stepDad = member({ id: 'ben', name: 'Zach Lopez', generation: -1, side: 'maternal', relation: 'step_parent' });
    const uncle = member({ id: 'juan', name: 'Juan Ortiz', generation: -1, side: 'maternal', relation: 'uncle' });
    const members = [uncle, mom, stepDad];
    // Run the real upstream step first — this is what records the exact
    // pairing (paired_with_id), not just a side guess.
    alignMarriedInSidesWithSpouse(members, [{ fromId: 'ben', toId: 'mom', type: 'spouse_of' }]);

    sortFamilyMembersForDisplay(members);

    const order = members.map((m) => m.id);
    const momIdx = order.indexOf('mom');
    const benIdx = order.indexOf('ben');
    expect(Math.abs(momIdx - benIdx)).toBe(1);
  });

  it('falls back to side-matching (best-effort) when no exact pairing was recorded', () => {
    // No alignMarriedInSidesWithSpouse call here — simulates a tree built
    // without raw edges (e.g. the name-inference-only fallback path).
    const mom = member({ id: 'mom', name: 'Ana Ortiz', generation: -1, side: 'maternal', relation: 'parent' });
    const stepDad = member({ id: 'ben', name: 'Zach Lopez', generation: -1, side: 'maternal', relation: 'step_parent' });
    const members = [mom, stepDad];

    sortFamilyMembersForDisplay(members);

    expect(members.map((m) => m.id)).toEqual(['mom', 'ben']);
  });

  it('keeps plain alphabetical order for members with no married-in pairing', () => {
    const zoe = member({ id: 'zoe', name: 'Zoe', generation: 0, relation: 'cousin' });
    const amy = member({ id: 'amy', name: 'Amy', generation: 0, relation: 'cousin' });
    const members = [zoe, amy];

    sortFamilyMembersForDisplay(members);

    expect(members.map((m) => m.id)).toEqual(['amy', 'zoe']);
  });

  it('sorts self first within a generation regardless of name', () => {
    const you = member({ id: 'you', name: 'Zack', generation: 0, is_self: true, relation: 'related' });
    const cousin = member({ id: 'cousin', name: 'Amy', generation: 0, relation: 'cousin' });
    const members = [cousin, you];

    sortFamilyMembersForDisplay(members);

    expect(members[0].id).toBe('you');
  });

  it('clusters a plain blood-relation couple (two grandparents) even when names sort far apart', () => {
    const abuela = member({ id: 'abuela', name: 'Rosa Mendoza', kinship_title: 'Abuela', generation: -2, relation: 'grandparent' });
    const abuelo = member({ id: 'abuelo', name: 'Zeke Mendoza', kinship_title: 'Abuelo', generation: -2, relation: 'grandparent' });
    const auntBetween = member({ id: 'tia', name: 'Vera Ruiz', generation: -2, relation: 'aunt' });
    const members = [auntBetween, abuelo, abuela];
    alignMarriedInSidesWithSpouse(members, [{ fromId: 'abuela', toId: 'abuelo', type: 'spouse_of' }]);

    sortFamilyMembersForDisplay(members);

    const order = members.map((m) => m.id);
    expect(Math.abs(order.indexOf('abuela') - order.indexOf('abuelo'))).toBe(1);
  });

  it('leads Abuela\'s generation row ahead of alphabetically-earlier relatives, matched by kinship_title', () => {
    const abuela = member({ id: 'abuela', name: 'Rosa Mendoza', kinship_title: 'Abuela', generation: -2, relation: 'grandparent' });
    const auntBefore = member({ id: 'tia', name: 'Ana Ruiz', generation: -2, relation: 'aunt' });
    const members = [auntBefore, abuela];

    sortFamilyMembersForDisplay(members);

    expect(members[0].id).toBe('abuela');
  });

  it('pulls Abuela\'s paired spouse to the front of the row alongside her', () => {
    const abuela = member({ id: 'abuela', name: 'Rosa Mendoza', kinship_title: 'Abuela', generation: -2, relation: 'grandparent' });
    const abuelo = member({ id: 'abuelo', name: 'Zeke Mendoza', kinship_title: 'Abuelo', generation: -2, relation: 'grandparent' });
    const auntBefore = member({ id: 'tia', name: 'Ana Ruiz', generation: -2, relation: 'aunt' });
    const members = [auntBefore, abuelo, abuela];
    alignMarriedInSidesWithSpouse(members, [{ fromId: 'abuela', toId: 'abuelo', type: 'spouse_of' }]);

    sortFamilyMembersForDisplay(members);

    const order = members.map((m) => m.id);
    expect(order.slice(0, 2).sort()).toEqual(['abuela', 'abuelo']);
    expect(order[2]).toBe('tia');
  });

  it('matches Abuela by name when kinship_title is not set', () => {
    const abuela = member({ id: 'abuela', name: 'Abuela', generation: -2, relation: 'grandparent' });
    const auntBefore = member({ id: 'tia', name: 'Ana Ruiz', generation: -2, relation: 'aunt' });
    const members = [auntBefore, abuela];

    sortFamilyMembersForDisplay(members);

    expect(members[0].id).toBe('abuela');
  });
});

describe('familyTreeService — getKidsTogetherForRelationship (step-kid inference gate)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Mia is a "together" kid — both self and the partner are independently
   * recorded as her parents (relation:'child' from self's side via the
   * self-relative edge rule, parent_id pointing at the partner via the
   * structural edge rule). Eli is self's kid from elsewhere — only self is
   * connected to him; the partner has no recorded connection at all.
   */
  function fakeTree(): FamilyTreeDTO {
    return {
      self_id: 'you',
      branches: [],
      members: [
        member({ id: 'you', name: 'You', is_self: true, relation: 'related', generation: 0 }),
        member({ id: 'mia', name: 'Mia', relation: 'child', generation: 1, parent_id: 'partner-1' }),
        member({ id: 'eli', name: 'Eli', relation: 'child', generation: 1, parent_id: 'you' }),
      ],
    };
  }

  it('always includes a directly-observed shared kid ("together"), regardless of relationship type', async () => {
    vi.spyOn(familyTreeService, 'getUserFamilyTree').mockResolvedValue(fakeTree());

    const kids = await familyTreeService.getKidsTogetherForRelationship('user-1', 'partner-1', 'dating');

    expect(kids.map((k) => k.id)).toEqual(['mia']);
    expect(kids[0]).toMatchObject({ relation: 'together', belongsTo: 'both' });
  });

  it('hides a self-only kid as a step-kid for a casual relationship type (regression: every kid used to show up for every partner)', async () => {
    vi.spyOn(familyTreeService, 'getUserFamilyTree').mockResolvedValue(fakeTree());

    const dating = await familyTreeService.getKidsTogetherForRelationship('user-1', 'partner-1', 'dating');
    expect(dating.some((k) => k.id === 'eli')).toBe(false);

    const noType = await familyTreeService.getKidsTogetherForRelationship('user-1', 'partner-1', null);
    expect(noType.some((k) => k.id === 'eli')).toBe(false);
  });

  it('shows a self-only kid as a step-kid once the relationship is committed or a co-parent label', async () => {
    vi.spyOn(familyTreeService, 'getUserFamilyTree').mockResolvedValue(fakeTree());

    const married = await familyTreeService.getKidsTogetherForRelationship('user-1', 'partner-1', 'married');
    const eli = married.find((k) => k.id === 'eli');
    expect(eli).toMatchObject({ relation: 'step', belongsTo: 'self' });

    const coParent = await familyTreeService.getKidsTogetherForRelationship('user-1', 'partner-1', 'baby_mama');
    expect(coParent.some((k) => k.id === 'eli')).toBe(true);
  });
});

describe('familyTreeService — resolveRawKinshipType (regression for the Ben Lopez not pairing with Mom bug)', () => {
  // A row can be correctly, specifically typed in relationship_type (e.g.
  // "you step_child_of Ben" — you're recorded as HIS step-child) while its
  // separate metadata.kinship field is a display label for the OTHER
  // direction ("stepfather" — what you call him). Treating kinship as the
  // edge's own type flips the meaning: the row still reads "you --step_
  // parent_of--> Ben", i.e. backwards. A specific relationship_type column
  // value must win over kinship, not the other way around.
  it('trusts a specific relationship_type over metadata.kinship describing the other direction', () => {
    expect(resolveRawKinshipType(null, 'step_child_of', 'stepfather')).toBe('step_child_of');
    expect(resolveRawKinshipType(undefined, 'parent_of', 'mother')).toBe('parent_of');
  });

  it('falls back to metadata.kinship only when relationship_type is a generic bucket or empty', () => {
    expect(resolveRawKinshipType(null, 'family', 'stepfather')).toBe('stepfather');
    expect(resolveRawKinshipType(null, 'related_to', 'aunt')).toBe('aunt');
    expect(resolveRawKinshipType(null, '', 'uncle')).toBe('uncle');
    expect(resolveRawKinshipType(null, null, 'cousin')).toBe('cousin');
  });

  it('relationship_role always wins outright, even over a specific relationship_type', () => {
    expect(resolveRawKinshipType('grandmother', 'step_child_of', 'stepfather')).toBe('grandmother');
  });

  it('returns the generic bucket type itself when nothing more specific is available', () => {
    expect(resolveRawKinshipType(null, 'family', null)).toBe('family');
  });
});
