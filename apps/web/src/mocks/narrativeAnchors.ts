import type { NarrativeAnchor } from '../components/narrative/NarrativeAnchorsBook';

const builtAt = '2026-07-12T18:30:00.000Z';

const member = (id: string, name: string, kind = 'entity', role?: string) => ({ id, name, kind, role });
const evidence = (id: string, label: string, source = 'fact', confidence = 0.86) => ({ id, label, source, confidence });

export const MOCK_NARRATIVE_ANCHORS: NarrativeAnchor[] = [
  {
    id: 'demo-building-lorekeeper', title: 'Building Lorekeeper', anchorType: 'project_arc', confidence: 0.94, gravityScore: 0.96,
    startDate: '2024-03-01T12:00:00.000Z',
    entities: [member('marcus', 'Marcus Johnson', 'entity', 'early collaborator'), member('sam', 'Sam Park', 'entity', 'sounding board')],
    groups: [member('omega', 'Omega Technologies', 'group', 'studio')], places: [],
    events: [member('prototype', 'First working prototype', 'event'), member('rebuild', 'Memory engine rebuild', 'event')],
    evidence: [evidence('lb-1', 'You returned to the product across 31 conversations', 'pattern', 0.96), evidence('lb-2', 'The first working prototype became a turning point', 'event', 0.91), evidence('lb-3', 'Marcus and Sam recur in decisions about the product', 'co_mention', 0.87)],
    provenance: { builtAt, signals: ['project recurrence', 'shared decisions', 'milestones'] },
  },
  {
    id: 'demo-robotics', title: 'The Robotics Pivot', anchorType: 'work_era', confidence: 0.9, gravityScore: 0.91,
    startDate: '2022-08-01T12:00:00.000Z', endDate: '2024-02-01T12:00:00.000Z',
    entities: [member('prof-smith', 'Professor Smith', 'entity', 'mentor'), member('sarah', 'Sarah Chen', 'entity', 'teammate')],
    groups: [member('robotics-lab', 'Robotics Lab', 'group', 'team')], places: [member('engineering-lab', 'Engineering Lab', 'place')],
    events: [member('ros-demo', 'ROS 2 demo day', 'event')],
    evidence: [evidence('rp-1', 'Robotics appears across school, career, and project memories', 'pattern', 0.93), evidence('rp-2', 'Professor Smith is repeatedly tied to the career pivot', 'relationship', 0.89), evidence('rp-3', 'Demo day anchors this chapter in time', 'event', 0.84)],
    provenance: { builtAt, signals: ['career change', 'mentor', 'resolved event'] },
  },
  {
    id: 'demo-sam-relationship', title: 'Sam — Learning to Build Together', anchorType: 'relationship_arc', confidence: 0.92, gravityScore: 0.9,
    startDate: '2021-05-01T12:00:00.000Z',
    entities: [member('sam', 'Sam Park', 'entity', 'partner')], groups: [], places: [member('corner-cafe', 'The Corner Café', 'place')],
    events: [member('first-trip', 'First trip together', 'event'), member('move', 'Moving in together', 'event')],
    evidence: [evidence('sr-1', 'Sam is present in 24 memories across five years', 'mention', 0.96), evidence('sr-2', 'Shared decisions shift from dating to building a home', 'pattern', 0.91), evidence('sr-3', 'The Corner Café recurs as an early relationship setting', 'co_mention', 0.85)],
    provenance: { builtAt, signals: ['relationship phases', 'shared home', 'recurring place'] },
  },
  {
    id: 'demo-family-home', title: 'Sundays at Grandma Wren’s', anchorType: 'family_period', confidence: 0.88, gravityScore: 0.86,
    startDate: '2012-01-01T12:00:00.000Z', endDate: '2020-12-31T12:00:00.000Z',
    entities: [member('lucia', 'Lucia Solenne', 'entity', 'grandmother'), member('mom', 'Elena Solenne', 'entity', 'mother'), member('javier', 'Javier Solenne', 'entity', 'uncle')],
    groups: [member('solenne-family', 'Solenne Family', 'group')], places: [member('grandma-house', 'Grandma Wren’s House', 'place')], events: [],
    evidence: [evidence('fh-1', 'Sunday meals recur across eight family memories', 'pattern', 0.91), evidence('fh-2', 'Lucia, Elena, and Javier repeatedly appear together', 'co_mention', 0.88), evidence('fh-3', 'Grandma Wren’s house is the consistent location anchor', 'mention', 0.84)],
    provenance: { builtAt, signals: ['weekly gathering', 'family cluster', 'shared place'] },
  },
  {
    id: 'demo-college', title: 'College: Finding the Work', anchorType: 'school_era', confidence: 0.85, gravityScore: 0.82,
    startDate: '2018-09-01T12:00:00.000Z', endDate: '2022-06-15T12:00:00.000Z',
    entities: [member('maya', 'Maya Thornwick', 'entity', 'sister'), member('jordan', 'Jordan Lee', 'entity', 'classmate')],
    groups: [member('robotics-club', 'Robotics Club', 'group')], places: [member('ucsb', 'UCSB', 'place')], events: [member('graduation', 'Graduation', 'event')],
    evidence: [evidence('cs-1', 'UCSB, robotics, and Jordan recur in the same period', 'co_mention', 0.88), evidence('cs-2', 'Graduation provides a confirmed chapter boundary', 'event', 0.9)],
    provenance: { builtAt, signals: ['school period', 'community', 'graduation'] },
  },
  {
    id: 'demo-scene', title: 'The Warehouse Show Years', anchorType: 'community', confidence: 0.83, gravityScore: 0.79,
    startDate: '2016-02-01T12:00:00.000Z', endDate: '2019-08-01T12:00:00.000Z',
    entities: [member('bryan', 'Bryan O’Connor', 'entity', 'bandmate'), member('taylor', 'Taylor Brooks', 'entity', 'friend')],
    groups: [member('rust-radio', 'Rust Radio', 'group', 'band')], places: [member('club-nova', 'Club Nova', 'place')], events: [member('final-show', 'The final summer show', 'event')],
    evidence: [evidence('ws-1', 'Bryan, Taylor, Rust Radio, and Club Nova form a recurring cluster', 'co_mention', 0.89), evidence('ws-2', 'Show memories span three years', 'event', 0.82)],
    provenance: { builtAt, signals: ['music community', 'repeated cast', 'venue'] },
  },
  {
    id: 'demo-japan', title: 'Japan Changed the Pace', anchorType: 'travel_period', confidence: 0.78, gravityScore: 0.72,
    startDate: '2023-10-04T12:00:00.000Z', endDate: '2023-10-19T12:00:00.000Z',
    entities: [member('sam', 'Sam Park', 'entity', 'travel partner')], groups: [], places: [member('tokyo', 'Tokyo', 'place'), member('kyoto', 'Kyoto', 'place')],
    events: [member('kyoto-train', 'Missed train to Kyoto', 'event')],
    evidence: [evidence('jp-1', 'Tokyo and Kyoto connect six memories from the same trip', 'event', 0.84), evidence('jp-2', 'Later reflections refer back to the trip as a reset', 'fact', 0.76)],
    provenance: { builtAt, signals: ['bounded trip', 'shared person', 'later reflection'] },
  },
  {
    id: 'demo-coffee', title: 'Saturday Coffee & Long Notes', anchorType: 'recurring_activity', confidence: 0.81, gravityScore: 0.7,
    startDate: '2024-01-06T12:00:00.000Z',
    entities: [member('self', 'You', 'entity', 'writer')], groups: [], places: [member('corner-cafe', 'The Corner Café', 'place')], events: [],
    evidence: [evidence('cf-1', 'Saturday morning writing appears in 14 entries', 'pattern', 0.91), evidence('cf-2', 'The Corner Café is linked to nine of those entries', 'co_mention', 0.85)],
    provenance: { builtAt, signals: ['weekly cadence', 'writing', 'recurring place'] },
  },
  {
    id: 'demo-current-era', title: 'Choosing What to Keep', anchorType: 'life_era', confidence: 0.69, gravityScore: 0.67,
    startDate: '2025-11-01T12:00:00.000Z',
    entities: [member('sam', 'Sam Park', 'entity', 'partner'), member('maya', 'Maya Thornwick', 'entity', 'sister')], groups: [], places: [],
    events: [member('new-home', 'A new home base', 'event')],
    evidence: [evidence('ce-1', 'Recent memories repeatedly weigh ambition against stability', 'pattern', 0.76), evidence('ce-2', 'A new home base may mark the beginning of a chapter', 'event', 0.68)],
    provenance: { builtAt, signals: ['emerging theme', 'recent period', 'still learning'] },
  },
];
