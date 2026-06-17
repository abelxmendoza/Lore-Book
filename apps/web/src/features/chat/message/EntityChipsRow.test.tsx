import { describe, it, expect, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EntityChipsRow, type EntityChip } from './EntityChipsRow';

const maya: EntityChip = {
  id: 'c1',
  name: 'Tía Maria',
  type: 'character',
  confidence: 1,
  provenance: 'character_book',
};

const sanDiego: EntityChip = {
  id: 'l1',
  name: 'San Diego',
  type: 'location',
  confidence: 1,
  provenance: 'location_book',
};

const omegaOnly: EntityChip = {
  id: 'oe1',
  name: 'Zephyr',
  type: 'character',
  confidence: 0.7,
  provenance: 'omega_entity',
  mentionStatus: 'mentioned_only',
};

function renderRow(entities: EntityChip[], props: Partial<ComponentProps<typeof EntityChipsRow>> = {}) {
  return render(
    <MemoryRouter>
      <EntityChipsRow entities={entities} {...props} />
    </MemoryRouter>
  );
}

describe('EntityChipsRow', () => {
  it('renders detected entity chips for characters and locations', () => {
    renderRow([maya, sanDiego]);
    expect(screen.getByText('detected:')).toBeInTheDocument();
    expect(screen.getByText('Tía Maria')).toBeInTheDocument();
    expect(screen.getByText('San Diego')).toBeInTheDocument();
  });

  it('marks omega-only entities as tentative with a question marker', () => {
    renderRow([omegaOnly]);
    const chip = screen.getByRole('button', { name: /Zephyr/i });
    expect(chip).toHaveTextContent('?');
    expect(chip.className).toMatch(/border-dashed/);
  });

  it('collapses overflow chips after max', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({
      id: `c${i}`,
      name: `Person ${i}`,
      type: 'character' as const,
    }));
    renderRow(many, { max: 3 });
    expect(screen.getByText('+3 more')).toBeInTheDocument();
  });

  it('calls onSelect in focus mode instead of navigating', () => {
    const onSelect = vi.fn();
    renderRow([maya], { mode: 'focus', onSelect, label: 'building on:' });
    fireEvent.click(screen.getByRole('button', { name: /Tía Maria/i }));
    expect(onSelect).toHaveBeenCalledWith(maya);
  });

  it('renders organization chips with entity styling', () => {
    renderRow([
      {
        id: 'o1',
        name: 'Acme Corp',
        type: 'organization',
        confidence: 1,
        provenance: 'organization_book',
      },
    ]);
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
  });

  it('shows overflow count when entities exceed max without rendering hidden chips', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      id: `c${i}`,
      name: `Person ${i}`,
      type: 'character' as const,
    }));
    renderRow(many, { max: 2 });
    expect(screen.getByText('Person 0')).toBeInTheDocument();
    expect(screen.getByText('Person 1')).toBeInTheDocument();
    expect(screen.getByText('+3 more')).toBeInTheDocument();
    expect(screen.queryByText('Person 4')).not.toBeInTheDocument();
  });
});
