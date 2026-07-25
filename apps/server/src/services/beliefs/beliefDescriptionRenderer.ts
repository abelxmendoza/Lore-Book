import type {
  BeliefModality,
  BeliefPolarity,
  BeliefSubjectResolution,
  PropositionAttribution,
  PropositionDomain,
} from './beliefTypes';

export function renderBeliefDescription(input: {
  subject: BeliefSubjectResolution;
  predicate: string;
  objectDisplay?: string;
  polarity: BeliefPolarity;
  modality: BeliefModality;
  domain: PropositionDomain;
  attribution?: PropositionAttribution;
  sourceText: string;
}): string {
  const subject = input.subject.displayName || 'The user';
  const object = (input.objectDisplay || '').trim();

  if (input.attribution?.status === 'ALLEGATION') {
    const claim = object || summarizeSource(input.sourceText);
    return `${subject} reported that some people accused him of ${claim}.`
      .replace(/\s+/g, ' ')
      .trim();
  }

  if (input.domain === 'EMOTIONAL_STATE') {
    const emotion = extractEmotion(input.sourceText) || object || 'an emotion';
    return `${subject} felt ${emotion}.`;
  }

  if (input.domain === 'EVENT') {
    const cleaned = cleanFirstPerson(input.sourceText, subject);
    return cleaned.endsWith('.') ? cleaned : `${cleaned}.`;
  }

  if (input.domain === 'RESIDENCE' && /live/i.test(input.predicate + input.sourceText)) {
    const place = object || extractAfter(input.sourceText, /live(?:s)?\s+(?:in|with)\s+/i) || 'an unknown place';
    return `${subject} lives ${/^(in|with)\b/i.test(place) ? place : `in ${place}`}.`;
  }

  if (input.domain === 'IDENTITY' && /\bcreat/i.test(input.sourceText)) {
    const project = object || extractAfter(input.sourceText, /creat(?:ed|or of)\s+/i) || 'a project';
    return `${subject} created ${project}.`;
  }

  if (input.polarity === 'NEGATIVE') {
    const target = object || extractAfter(input.sourceText, /\bnot\s+/i) || 'that claim';
    return `${subject} is not ${target}.`.replace(/\bis not is not\b/i, 'is not');
  }

  // Repair common malformed grammar while compiling
  let body = cleanFirstPerson(input.sourceText, subject);
  body = body
    .replace(/\bwas build\b/gi, 'worked on')
    .replace(/\bthink\b/gi, 'thinks')
    .replace(/\bgonna\b/gi, 'going to')
    .replace(/\bchat gpt\b/gi, 'ChatGPT');

  if (!body.toLowerCase().startsWith(subject.toLowerCase())) {
    if (object) return `${subject} ${input.predicate.replace(/_/g, ' ')} ${object}.`;
    return `${subject}: ${body}`.replace(/\s+/g, ' ').trim();
  }

  return body.endsWith('.') ? body : `${body}.`;
}

function cleanFirstPerson(text: string, subject: string): string {
  return text
    .trim()
    .replace(/^(?:yeah|so|well|right now)\s+/i, '')
    .replace(/^i(?:'m| am)\s+/i, `${subject} is `)
    .replace(/^i(?:'ve| have)\s+/i, `${subject} has `)
    .replace(/^i\s+/i, `${subject} `)
    .replace(/\bmy\b/gi, `${subject}'s`)
    .replace(/\s+/g, ' ')
    .trim();
}

function extractEmotion(text: string): string | null {
  if (/\bstoked\b/i.test(text)) return 'excited';
  if (/\bdepressed\b/i.test(text)) return 'depressed';
  if (/\bexcited\b/i.test(text)) return 'excited';
  if (/\banxious\b/i.test(text)) return 'anxious';
  if (/\bunwelcome\b/i.test(text)) return 'unwelcome';
  if (/\bkicked out|excluded\b/i.test(text)) return 'permanently excluded';
  return null;
}

function extractAfter(text: string, re: RegExp): string | null {
  const m = text.match(re);
  if (!m || m.index == null) return null;
  return text.slice(m.index + m[0].length).replace(/[.:]+$/, '').trim() || null;
}

function summarizeSource(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 120);
}
