import { describe, expect, it } from 'vitest';

import { gateEntityFactWrite } from '../../../src/services/entities/entityFactWriteGate';

describe('entityFactWriteGate', () => {
  it('drops conversational act facts on the self path', () => {
    const d = gateEntityFactWrite(
      { fact: 'Is asking whether Lore remembers their story', category: 'general', confidence: 0.9 },
      { path: 'self' },
    );
    expect(d.action).toBe('drop');
    if (d.action === 'drop') expect(d.kind).toBe('conversational');
  });

  it('drops ephemeral schedule noise', () => {
    const d = gateEntityFactWrite(
      { fact: 'Is on their second day and starts at 9am tomorrow', category: 'career', confidence: 0.8 },
      { path: 'self' },
    );
    expect(d.action).toBe('drop');
    if (d.action === 'drop') expect(d.kind).toBe('ephemeral');
  });

  it('keeps durable employment claims', () => {
    const d = gateEntityFactWrite(
      { fact: 'Works at Vanguard Robotics as a QA technician', category: 'career', confidence: 0.95 },
      { path: 'self', sourceText: 'I work at Vanguard Robotics as a QA technician.' },
    );
    expect(d.action).toBe('keep');
  });

  it('rejects third-person celebrity-style claims on self', () => {
    const d = gateEntityFactWrite(
      { fact: 'Marcus is a DJ for Northwind Labs', category: 'career', confidence: 0.8 },
      { path: 'self', sourceText: 'Marcus is a DJ for Northwind Labs.' },
    );
    expect(d.action).toBe('drop');
    if (d.action === 'drop') expect(d.kind).toBe('subject');
  });

  it('rejects bare recruiter/DJ role claims without self ownership', () => {
    const d = gateEntityFactWrite(
      { fact: 'Is a recruiter at Northwind Labs', category: 'career', confidence: 0.7 },
      { path: 'self' },
    );
    expect(d.action).toBe('drop');
  });

  it('tags feelings vs self-asserted', () => {
    const feel = gateEntityFactWrite(
      { fact: 'Feels anxious about interviews', category: 'personality', confidence: 0.7 },
      { path: 'self' },
    );
    expect(feel.action).toBe('keep');
    if (feel.action === 'keep') expect(feel.assertionType).toBe('feeling');

    const self = gateEntityFactWrite(
      { fact: 'Lives in Los Angeles', category: 'location', confidence: 0.9 },
      { path: 'self' },
    );
    expect(self.action).toBe('keep');
    if (self.action === 'keep') expect(self.assertionType).toBe('self_asserted');
  });
});
