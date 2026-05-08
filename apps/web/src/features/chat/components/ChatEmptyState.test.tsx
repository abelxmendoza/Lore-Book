import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '../../../test/utils';
import { ChatEmptyState } from './ChatEmptyState';

describe('ChatEmptyState', () => {
  it('renders chat-first messaging: "This is where your story is built"', () => {
    render(<ChatEmptyState />);
    expect(screen.getByText(/This is where your story is built/i)).toBeInTheDocument();
    expect(screen.getByText(/Timelines, characters, and quests fill in as you talk/i)).toBeInTheDocument();
  });

  it('renders AI Life Guidance Chat heading', () => {
    render(<ChatEmptyState />);
    expect(screen.getByRole('heading', { name: /AI Life Guidance Chat/i })).toBeInTheDocument();
  });

  it('renders main prompt about dumping freely and updating timeline', () => {
    render(<ChatEmptyState />);
    expect(screen.getByText(/Dump everything freely here/i)).toBeInTheDocument();
    expect(screen.getByText(/automatically updating your timeline/i)).toBeInTheDocument();
  });
});
