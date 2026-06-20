import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LoreOfLoreBookContent } from './LoreOfLoreBook';

describe('LoreOfLoreBookContent', () => {
  it('renders the Lore of LoreBook title', () => {
    render(<LoreOfLoreBookContent />);
    expect(screen.getByRole('heading', { level: 1, name: /Lore of LoreBook/i })).toBeInTheDocument();
  });

  it('shows vision evolution by default', () => {
    render(<LoreOfLoreBookContent />);
    expect(screen.getByText('Version 1 Vision')).toBeInTheDocument();
    expect(screen.getByText(/Personal AI memory — a chatbot that remembers what you tell it/i)).toBeInTheDocument();
    expect(screen.getByText('Jan 2025')).toBeInTheDocument();
    expect(screen.getByText('May 2026')).toBeInTheDocument();
  });

  it('switches to timeline tab', () => {
    render(<LoreOfLoreBookContent />);
    fireEvent.click(screen.getByRole('button', { name: /Timeline/i }));
    expect(screen.getByText('LoreBook Created')).toBeInTheDocument();
  });

  it('switches to chapters tab', () => {
    render(<LoreOfLoreBookContent />);
    fireEvent.click(screen.getByRole('button', { name: /Chapters/i }));
    expect(screen.getByText('The Idea Era')).toBeInTheDocument();
    expect(screen.getByText('Social Intelligence Era')).toBeInTheDocument();
  });
});
