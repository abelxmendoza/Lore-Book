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
    expect(screen.getByText('Aug 2026')).toBeInTheDocument();
    expect(screen.getByText('Version 4 Vision')).toBeInTheDocument();
    expect(screen.getByText(/Your life, on a real calendar/i)).toBeInTheDocument();
  });

  it('switches to timeline tab', () => {
    render(<LoreOfLoreBookContent />);
    fireEvent.click(screen.getByRole('tab', { name: 'Timeline' }));
    expect(screen.getByText('LoreBook Created')).toBeInTheDocument();
    expect(screen.getByText('Time as it happened')).toBeInTheDocument();
  });

  it('switches to chapters tab', () => {
    render(<LoreOfLoreBookContent />);
    fireEvent.click(screen.getByRole('tab', { name: 'Chapters' }));
    expect(screen.getByText('The Idea Era')).toBeInTheDocument();
    expect(screen.getByText('Social Intelligence Era')).toBeInTheDocument();
    expect(screen.getByText('Continuity Era')).toBeInTheDocument();
  });
});
