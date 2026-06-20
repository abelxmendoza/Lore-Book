import { describe, it, expect } from 'vitest';
import { clientLexicalPreviewSpans } from './clientLexicalPreview';

const ROBOTICS_WORKPLACE_FIXTURE_TEXT =
  "I worked at Vanguard Robotics as a robot tech with Gary and Jeff. I was doing ArUco calibration, gripper swaps, and live robot support at Denny's in Hollywood.";

describe('clientLexicalPreviewSpans — robotics workplace fixture', () => {
  it('highlights Vanguard Robotics as ORGANIZATION', () => {
    const spans = clientLexicalPreviewSpans(ROBOTICS_WORKPLACE_FIXTURE_TEXT);
    expect(spans.some((s) => s.text === 'Vanguard Robotics' && s.type === 'ORGANIZATION')).toBe(true);
  });

  it('highlights robot tech as ROLE', () => {
    const spans = clientLexicalPreviewSpans(ROBOTICS_WORKPLACE_FIXTURE_TEXT);
    expect(spans.some((s) => /robot tech/i.test(s.text) && s.type === 'ROLE')).toBe(true);
  });

  it('highlights Gary and Jeff as PERSON', () => {
    const spans = clientLexicalPreviewSpans(ROBOTICS_WORKPLACE_FIXTURE_TEXT);
    expect(spans.some((s) => s.text === 'Gary')).toBe(true);
    expect(spans.some((s) => s.text === 'Jeff')).toBe(true);
  });

  it('highlights ArUco calibration as SKILL', () => {
    const spans = clientLexicalPreviewSpans(ROBOTICS_WORKPLACE_FIXTURE_TEXT);
    expect(spans.some((s) => /ArUco calibration/i.test(s.text) && s.colorKey === 'skill')).toBe(true);
  });

  it('highlights deployment site at Denny\'s in Hollywood', () => {
    const spans = clientLexicalPreviewSpans(ROBOTICS_WORKPLACE_FIXTURE_TEXT);
    expect(spans.some((s) => s.type === 'DEPLOYMENT_SITE' && /Denny's in Hollywood/i.test(s.text))).toBe(true);
  });

  it('marks offline spans as new by default', () => {
    const spans = clientLexicalPreviewSpans(ROBOTICS_WORKPLACE_FIXTURE_TEXT);
    expect(spans.every((s) => s.entityStatus === 'new')).toBe(true);
  });
});
