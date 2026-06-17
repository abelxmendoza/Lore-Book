// Mock vicarious romantic periphery for Love & Relationships demo

import type { RomanticPeripheral } from '../api/romanticPeripherals';

export const MOCK_ROMANTIC_PERIPHERALS: RomanticPeripheral[] = [
  {
    id: 'periph-sam-marcus',
    anchor_relationship_id: 'rel-003',
    anchor_person_id: 'char-sam',
    anchor_person_type: 'character',
    peripheral_person_id: null,
    peripheral_person_type: null,
    peripheral_surface: 'Marcus',
    role: 'side_partner',
    tier: 'suspected',
    confidence: 0.85,
    has_met: false,
    proximity: 'third_party',
    associated_via: 'chat_extract',
    source_message_ids: ['msg-sam-overlap'],
    anchor_name: 'Sam',
    peripheral_name: 'Marcus',
    metadata: {
      lexical_evidence: '…Sam was texting Marcus while we were still seeing each other…',
      glossary_cues: ['texting another', 'seeing someone else'],
      ontology_tags: ['ROMANTIC/VICARIOUS/SUSPECTED'],
      anchor_name: 'Sam',
    },
  },
  {
    id: 'periph-alex-coworker',
    anchor_relationship_id: 'rel-001',
    anchor_person_id: 'char-alex',
    anchor_person_type: 'character',
    peripheral_person_id: null,
    peripheral_person_type: null,
    peripheral_surface: 'unnamed coworker',
    role: 'crush',
    tier: 'suspected',
    confidence: 0.78,
    has_met: false,
    proximity: 'unmet',
    associated_via: 'chat_extract',
    source_message_ids: ['msg-alex-coworker'],
    anchor_name: 'Alex',
    peripheral_name: 'unnamed coworker',
    metadata: {
      lexical_evidence: "…Alex mentioned she's been talking to someone at work…",
      glossary_cues: ['talking to other', 'seeing someone'],
      ontology_tags: ['ROMANTIC/VICARIOUS/SUSPECTED'],
      anchor_name: 'Alex',
    },
  },
  {
    id: 'periph-taylor-jordan',
    anchor_relationship_id: 'rel-004',
    anchor_person_id: 'char-taylor',
    anchor_person_type: 'character',
    peripheral_person_id: 'char-jordan',
    peripheral_person_type: 'character',
    peripheral_surface: 'Jordan',
    role: 'current_partner',
    tier: 'confirmed',
    confidence: 0.86,
    has_met: true,
    proximity: 'indirect',
    associated_via: 'chat_extract',
    source_message_ids: ['msg-taylor-jordan'],
    anchor_name: 'Taylor',
    peripheral_name: 'Jordan',
    metadata: {
      lexical_evidence: '…Taylor and Jordan are together now — I heard from the art studio…',
      glossary_cues: ['they are together', 'i heard she'],
      ontology_tags: ['ROMANTIC/VICARIOUS/CONFIRMED'],
      anchor_name: 'Taylor',
    },
  },
  {
    id: 'periph-morgan-nova',
    anchor_relationship_id: 'rel-005',
    anchor_person_id: 'char-morgan',
    anchor_person_type: 'character',
    peripheral_person_id: 'char-nova',
    peripheral_person_type: 'character',
    peripheral_surface: 'Nova',
    role: 'ex',
    tier: 'confirmed',
    confidence: 0.82,
    has_met: false,
    proximity: 'third_party',
    associated_via: 'chat_extract',
    source_message_ids: ['msg-morgan-nova'],
    anchor_name: 'Morgan',
    peripheral_name: 'Nova',
    metadata: {
      lexical_evidence: "…Morgan's ex Nova keeps coming up in old stories…",
      glossary_cues: ["'s ex", 'their ex'],
      ontology_tags: ['ROMANTIC/VICARIOUS/CONFIRMED'],
      anchor_name: 'Morgan',
    },
  },
];

export function getMockPeripheralsForRelationship(relationshipId: string): RomanticPeripheral[] {
  return MOCK_ROMANTIC_PERIPHERALS.filter(
    (p) => p.anchor_relationship_id === relationshipId && p.tier !== 'dismissed'
  );
}

export function getMockPeripheralById(id: string): RomanticPeripheral | undefined {
  return MOCK_ROMANTIC_PERIPHERALS.find((p) => p.id === id);
}
