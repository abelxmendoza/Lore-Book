/**
 * Reject physical objects/devices that are not user builds/projects.
 */

const OBJECT_WORDS =
  /\b(phone|vape|car|doorbell|watch|keys|wallet|laptop|camera|tablet|headphones|charger|cigarette|ring doorbell)\b/i;

const OBJECT_PHRASES =
  /\b(?:phone in|keys in|wallet in|forgot my phone|left my phone|my phone in|my mom'?s car|moms car|mom's car)\b/i;

const BUILD_CONTEXT =
  /\b(?:building|repairing|designing|developing|prototype|project called|robot build|working on (?:a|my|the)|creating (?:a|my|the))\b/i;

const PRODUCT_DEVICE =
  /\b(?:amazon ring|ring doorbell|apple watch|fitbit|airpods)\b/i;

export type ObjectGuardResult = {
  allowed: boolean;
  rejectedAs?: string;
  rejectionReason?: string;
  rulesFired: string[];
};

export function guardObjectReference(span: string, contextLine: string): ObjectGuardResult {
  const text = span.trim();
  const haystack = `${text} ${contextLine}`.toLowerCase();

  if (BUILD_CONTEXT.test(haystack)) {
    return { allowed: true, rulesFired: ['object_build_context'] };
  }

  if (OBJECT_PHRASES.test(haystack) || OBJECT_PHRASES.test(text)) {
    return {
      allowed: false,
      rejectedAs: 'OBJECT',
      rejectionReason: 'object_location_phrase',
      rulesFired: ['object_location_phrase'],
    };
  }

  if (PRODUCT_DEVICE.test(text) || PRODUCT_DEVICE.test(haystack)) {
    return {
      allowed: false,
      rejectedAs: 'PRODUCT_DEVICE',
      rejectionReason: 'product_device_reference',
      rulesFired: ['product_device_reference'],
    };
  }

  if (OBJECT_WORDS.test(text) && text.split(/\s+/).length <= 4) {
    return {
      allowed: false,
      rejectedAs: 'OBJECT',
      rejectionReason: 'physical_object',
      rulesFired: ['physical_object'],
    };
  }

  if (/\bphone in\b/i.test(text) || /\bcar\b/i.test(text) && /\bphone\b/i.test(text)) {
    return {
      allowed: false,
      rejectedAs: 'OBJECT',
      rejectionReason: 'object_location_phrase',
      rulesFired: ['object_in_location'],
    };
  }

  return { allowed: true, rulesFired: ['not_object_reference'] };
}
