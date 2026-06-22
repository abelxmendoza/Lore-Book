/** Guard consumer apps/products from becoming project or generic object cards. */

const CONSUMER_APP_REFERENCES = [
  { pattern: /\bfind\s+my\s+app\b/i, label: 'Find My app', rejectAs: 'consumer_app_reference' },
  { pattern: /\bgoogle\s+maps\b/i, label: 'Google Maps', rejectAs: 'consumer_app_reference' },
];

const NOT_OBJECT_PRODUCTS = new Set(['app', 'application', 'system', 'feature', 'project']);

export function isConsumerAppReference(text: string): boolean {
  return CONSUMER_APP_REFERENCES.some((r) => r.pattern.test(text));
}

export function getConsumerAppRejections(text: string): Array<{ displayName: string; reason: string }> {
  const out: Array<{ displayName: string; reason: string }> = [];
  for (const ref of CONSUMER_APP_REFERENCES) {
    if (ref.pattern.test(text)) {
      out.push({ displayName: ref.label, reason: ref.rejectAs });
    }
  }
  return out;
}

export function isProjectOrConceptWord(name: string): boolean {
  const key = name.trim().toLowerCase();
  return NOT_OBJECT_PRODUCTS.has(key) || ['idea', 'concept', 'thing', 'stuff'].includes(key);
}

export function classifyConsumerProduct(name: string): 'consumer_product' | 'device' {
  if (/\b(?:ring\s+doorbell|doorbell|smart\s+home)\b/i.test(name)) return 'consumer_product';
  if (/\b(?:phone|laptop|camera|tablet)\b/i.test(name)) return 'device';
  return 'consumer_product';
}

export function shouldAllowProjectLink(text: string, objectName: string): boolean {
  const built =
    /\b(?:built|building|assembled|customized|programmed|designed)\b/i.test(text) &&
    text.toLowerCase().includes(objectName.toLowerCase());
  return built;
}
