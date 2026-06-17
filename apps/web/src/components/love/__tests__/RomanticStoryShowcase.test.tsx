import { describe, expect, it } from 'vitest';
import { render, screen } from '../../../test/utils';
import userEvent from '@testing-library/user-event';
import { RomanticStoryShowcase } from '../RomanticStoryShowcase';
import { ROMANTIC_LORE_TEST_CASES } from '../../../mocks/romanticLoreStory';

describe('RomanticStoryShowcase', () => {
  it('renders nothing outside demo mode', () => {
    const { container } = render(<RomanticStoryShowcase demoMode={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows connected lore synopsis and chapters', () => {
    render(<RomanticStoryShowcase demoMode />);
    expect(screen.getByTestId('romantic-story-showcase')).toBeInTheDocument();
    expect(screen.getByTestId('romantic-lore-synopsis')).toBeInTheDocument();
    expect(screen.getByTestId('lore-chapter-1')).toBeInTheDocument();
    expect(screen.getByTestId('lore-chapter-4')).toBeInTheDocument();
  });

  it('renders character web', () => {
    render(<RomanticStoryShowcase demoMode />);
    expect(screen.getByTestId('lore-character-web')).toBeInTheDocument();
    expect(screen.getByTestId('lore-character-char-alex')).toBeInTheDocument();
    expect(screen.getByTestId('lore-character-char-priya')).toBeInTheDocument();
  });

  it('renders all lore test case cards', () => {
    render(<RomanticStoryShowcase demoMode />);
    for (const tc of ROMANTIC_LORE_TEST_CASES) {
      expect(screen.getByTestId(`lore-test-case-${tc.id}`)).toBeInTheDocument();
    }
  });

  it('filters test cases by category', async () => {
    const user = userEvent.setup();
    render(<RomanticStoryShowcase demoMode />);
    await user.click(screen.getByRole('button', { name: /ghosted/i }));
    expect(screen.getByTestId('lore-test-case-lore-riley-ghosted')).toBeInTheDocument();
  });
});
