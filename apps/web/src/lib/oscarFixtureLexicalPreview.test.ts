import { describe, it, expect } from 'vitest';
import { clientLexicalPreviewSpans } from './clientLexicalPreview';
import { enrichPreviewSpansWithKnownStatus } from './enrichPreviewSpansWithKnownStatus';
import { colorKeyForPreviewType } from './entityColorMap';
import type { CertifiedEntityMatch } from './certifiedEntityMatch';

const OSCAR_FIXTURE =
  "Oscar Trujio was my best friend. I havent seen him since before the Pandemic. " +
  "We used to go to shows in LA all the time. We went to Code Red and a bunch of ska shows. " +
  "I've never had any other friends like him since.";

describe('clientLexicalPreviewSpans — Oscar fixture', () => {
  it('highlights Oscar Trujio as PERSON', () => {
    const spans = clientLexicalPreviewSpans(OSCAR_FIXTURE);
    expect(spans.some((s) => s.text === 'Oscar Trujio' && s.type === 'PERSON')).toBe(true);
  });

  it('highlights best friend as RELATIONSHIP', () => {
    const spans = clientLexicalPreviewSpans(OSCAR_FIXTURE);
    expect(spans.some((s) => /best friend/i.test(s.text) && s.type === 'RELATIONSHIP')).toBe(true);
  });

  it('highlights before the Pandemic as TIME', () => {
    const spans = clientLexicalPreviewSpans(OSCAR_FIXTURE);
    expect(spans.some((s) => /before the Pandemic/i.test(s.text) && s.colorKey === 'time')).toBe(true);
  });

  it('highlights shows in LA as recurring event', () => {
    const spans = clientLexicalPreviewSpans(OSCAR_FIXTURE);
    expect(spans.some((s) => /go to shows in LA/i.test(s.text) && s.subtype === 'RECURRING_EVENT')).toBe(true);
  });

  it('highlights Code Red as a canonical afters-rave event series', () => {
    const spans = clientLexicalPreviewSpans(OSCAR_FIXTURE);
    const codeRed = spans.find((s) => s.text === 'Code Red');
    expect(codeRed?.subtype).toBe('AFTERS_RAVE_EVENT_SERIES');
    expect(codeRed?.needsReview).not.toBe(true);
  });

  it('highlights ska shows as INTEREST', () => {
    const spans = clientLexicalPreviewSpans(OSCAR_FIXTURE);
    expect(spans.some((s) => /ska shows/i.test(s.text) && s.colorKey === 'interest')).toBe(true);
  });

  it('highlights emotional significance phrase', () => {
    const spans = clientLexicalPreviewSpans(OSCAR_FIXTURE);
    expect(spans.some((s) => s.type === 'EMOTIONAL_SIGNIFICANCE')).toBe(true);
    expect(colorKeyForPreviewType('EMOTIONAL_SIGNIFICANCE')).toBe('emotional_significance');
  });

  it('marks all offline spans as new by default', () => {
    const spans = clientLexicalPreviewSpans(OSCAR_FIXTURE);
    expect(spans.every((s) => s.entityStatus === 'new')).toBe(true);
  });
});

describe('enrichPreviewSpansWithKnownStatus', () => {
  it('marks matching person as known when in certified index', () => {
    const spans = clientLexicalPreviewSpans('Oscar Trujio was my best friend.');
    const match = {
      id: 'char-1',
      type: 'character',
      name: 'Oscar Trujio',
      matchedLabel: 'Oscar Trujio',
      aliases: [],
      status: 'confirmed',
    } as CertifiedEntityMatch;

    const enriched = enrichPreviewSpansWithKnownStatus(spans, [match]);
    const oscar = enriched.find((s) => s.text === 'Oscar Trujio');
    expect(oscar?.entityStatus).toBe('known');
    expect(oscar?.matchedEntityId).toBe('char-1');
  });

  it('keeps unknown people as new', () => {
    const spans = clientLexicalPreviewSpans('Abel Mendoza got detention.');
    const enriched = enrichPreviewSpansWithKnownStatus(spans, []);
    expect(enriched.find((s) => s.text === 'Abel Mendoza')?.entityStatus).toBe('new');
  });
});
