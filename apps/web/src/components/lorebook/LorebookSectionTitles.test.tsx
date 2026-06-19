import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LorebookGeneratorSectionTitle, LorebookLibraryHero } from './LorebookSectionTitles';

describe('LorebookSectionTitles', () => {
  it('renders majestic LoreBook Library hero', () => {
    render(<LorebookLibraryHero subtitle="Test subtitle" />);
    expect(screen.getByRole('heading', { level: 1, name: /lorebook library/i })).toBeInTheDocument();
    expect(screen.getByText('Test subtitle')).toBeInTheDocument();
  });

  it('renders compact Lorebook Generator section title', () => {
    render(<LorebookGeneratorSectionTitle />);
    expect(screen.getByRole('heading', { level: 2, name: /lorebook generator/i })).toBeInTheDocument();
  });
});
