import { describe, it, expect } from 'vitest';

import { objectInferenceService } from '../../../src/services/objects/inference/objectInferenceService';
import { isBareGenericObject } from '../../../src/services/objects/inference/namedObjectInference';
import { isConsumerAppReference } from '../../../src/services/objects/inference/productReferenceGuard';
import { hasProvenance } from '../../../src/services/objects/inference/objectProvenanceService';

function infer(text: string, extra: Parameters<typeof objectInferenceService.inferFromMessage>[0] = {}) {
  return objectInferenceService.inferFromMessage({
    text,
    sourceMessageId: 'msg-1',
    authorRole: 'user',
    ...extra,
  });
}

function findAccepted(result: ReturnType<typeof infer>, namePart: string) {
  return result.accepted.find((c) =>
    c.displayName.toLowerCase().includes(namePart.toLowerCase()),
  );
}

describe('object inference rules', () => {
  it('detects phone as personal_item', () => {
    const result = infer('I forgot my phone at home.');
    const phone = findAccepted(result, 'Phone');
    expect(phone).toBeDefined();
    expect(phone!.objectType).toBe('personal_item');
    expect(phone!.context.userRelationship).toMatch(/owns|lost/);
  });

  it("detects mom's car as vehicle with owner Mom", () => {
    const result = infer("I forgot my phone in my mom's car.");
    const car = findAccepted(result, "Mom's Car");
    expect(car).toBeDefined();
    expect(car!.objectType).toBe('vehicle');
    expect(car!.context.owner).toMatch(/Mom/i);
  });

  it('Find My app is not project/object card by default', () => {
    expect(isConsumerAppReference('Find My app located my phone.')).toBe(true);
    const result = infer('Find My app located my phone yesterday.');
    expect(result.accepted.some((c) => /find my app/i.test(c.displayName))).toBe(false);
    expect(result.rejected.some((r) => r.reason === 'consumer_app_reference')).toBe(true);
  });

  it('detects Amazon Ring doorbell as consumer_product/device', () => {
    const result = infer('I worked on Amazon Ring doorbell installs today.');
    const doorbell = findAccepted(result, 'Ring');
    expect(doorbell).toBeDefined();
    expect(doorbell!.objectType).toBe('consumer_product');
  });

  it('detects bike as object', () => {
    const result = infer('Ducky was fixing his bike in the driveway.');
    const bike = findAccepted(result, 'Bike');
    expect(bike).toBeDefined();
    expect(bike!.objectType).toBe('personal_item');
  });

  it('fixing bike creates bike repair skill hint elsewhere', () => {
    const result = infer('Ducky was fixing his bike in the driveway.');
    expect(result.linkedSkillHints).toContain('Bike Repair');
    const bike = findAccepted(result, 'Bike');
    expect(bike!.context.skillContext).toBe('Bike Repair');
  });

  it('gripper swaps detect gripper as robot_part', () => {
    const result = infer('My shift included gripper swaps on the production line.');
    const gripper = findAccepted(result, 'Gripper');
    expect(gripper).toBeDefined();
    expect(gripper!.objectType).toBe('robot_part');
    expect(result.linkedSkillHints).toContain('Gripper Maintenance');
  });

  it('Omega-1 can be robot object + project if user-built', () => {
    const result = infer('I have been building Omega-1 in the garage.');
    const omega = findAccepted(result, 'Omega-1');
    expect(omega).toBeDefined();
    expect(omega!.objectType).toBe('robot');
    expect(omega!.linkedProjectName).toBe('Omega-1');
    expect(omega!.context.projectContext).toBe('Omega-1');
  });

  it('vape detected as sensitive object review-first', () => {
    const result = infer('I lost my vape at the show.');
    const vape = findAccepted(result, 'Vape');
    expect(vape).toBeDefined();
    expect(vape!.objectType).toBe('substance_or_consumable');
    expect(vape!.requiresReview).toBe(true);
    expect(vape!.context.privacySensitive).toBe(true);
  });

  it('generic thing/stuff/it rejected', () => {
    expect(isBareGenericObject('thing')).toBe(true);
    expect(isBareGenericObject('stuff')).toBe(true);
    expect(isBareGenericObject('it')).toBe(true);
    const result = infer('I lost that thing and some stuff.');
    expect(result.accepted.some((c) => ['thing', 'stuff', 'it'].includes(c.displayName.toLowerCase()))).toBe(
      false,
    );
  });

  it('every object includes provenance', () => {
    const result = infer("I forgot my phone in my mom's car.");
    expect(result.accepted.length).toBeGreaterThan(0);
    for (const obj of result.accepted) {
      expect(hasProvenance(obj)).toBe(true);
      expect(obj.sourceMessageIds.length).toBeGreaterThan(0);
      expect(obj.evidencePhrases.length).toBeGreaterThan(0);
    }
  });

  it('assistant-generated guesses do not create objects', () => {
    const result = objectInferenceService.inferFromMessage({
      text: 'You probably lost your phone based on context.',
      authorRole: 'assistant',
    });
    expect(result.accepted).toHaveLength(0);
    expect(result.rejected.some((r) => r.reason === 'assistant_generated')).toBe(true);
  });
});
