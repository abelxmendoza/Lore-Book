import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import { render, screen } from '../../test/utils';
import { RomanticInterestChatLauncher } from './RomanticInterestChatLauncher';

describe('RomanticInterestChatLauncher', () => {
  it('offers an existing Character Book match instead of creating a duplicate', async () => {
    const user = userEvent.setup();
    const onContinue = vi.fn();

    render(
      <RomanticInterestChatLauncher
        characters={[{ id: 'char-alex', name: 'Alex', aliases: ['Lex'] }]}
        onContinue={onContinue}
      />,
    );

    await user.click(screen.getByRole('button', { name: /add a new romantic interest/i }));
    await user.type(screen.getByRole('textbox', { name: /romantic interest name/i }), 'Lex');
    await user.click(screen.getByRole('button', { name: /chat about alex/i }));

    expect(onContinue).toHaveBeenCalledWith({
      name: 'Alex',
      character: { id: 'char-alex', name: 'Alex', aliases: ['Lex'] },
    });
  });

  it('makes the new-character path explicit when there is no match', async () => {
    const user = userEvent.setup();
    const onContinue = vi.fn();

    render(<RomanticInterestChatLauncher characters={[]} onContinue={onContinue} />);

    await user.click(screen.getByRole('button', { name: /add a new romantic interest/i }));
    await user.type(screen.getByRole('textbox', { name: /romantic interest name/i }), 'Jordan');
    await user.click(screen.getByRole('button', { name: /introduce jordan in chat/i }));

    expect(onContinue).toHaveBeenCalledWith({ name: 'Jordan', character: undefined });
  });

  describe('sex filter', () => {
    const characters = [
      { id: 'char-alex', name: 'Alex', sex: 'male' },
      { id: 'char-sam', name: 'Sam', sex: 'female' },
      { id: 'char-jamie', name: 'Jamie', sex: 'nonbinary' },
      { id: 'char-taylor', name: 'Taylor' }, // no sex set
    ];

    it('shows everyone under "All" by default', async () => {
      const user = userEvent.setup();
      render(<RomanticInterestChatLauncher characters={characters} onContinue={vi.fn()} />);
      await user.click(screen.getByRole('button', { name: /add a new romantic interest/i }));

      const matches = screen.getByLabelText('Character Book matches');
      expect(matches).toHaveTextContent('Alex');
      expect(matches).toHaveTextContent('Sam');
      expect(matches).toHaveTextContent('Jamie');
      expect(matches).toHaveTextContent('Taylor');
    });

    it('narrows to only male characters when the Male pill is active', async () => {
      const user = userEvent.setup();
      render(<RomanticInterestChatLauncher characters={characters} onContinue={vi.fn()} />);
      await user.click(screen.getByRole('button', { name: /add a new romantic interest/i }));
      await user.click(screen.getByRole('button', { name: 'Male' }));

      const matches = screen.getByLabelText('Character Book matches');
      expect(matches).toHaveTextContent('Alex');
      expect(matches).not.toHaveTextContent('Sam');
      expect(matches).not.toHaveTextContent('Jamie');
      expect(matches).not.toHaveTextContent('Taylor');
    });

    it('narrows to only female characters when the Female pill is active', async () => {
      const user = userEvent.setup();
      render(<RomanticInterestChatLauncher characters={characters} onContinue={vi.fn()} />);
      await user.click(screen.getByRole('button', { name: /add a new romantic interest/i }));
      await user.click(screen.getByRole('button', { name: 'Female' }));

      const matches = screen.getByLabelText('Character Book matches');
      expect(matches).toHaveTextContent('Sam');
      expect(matches).not.toHaveTextContent('Alex');
      expect(matches).not.toHaveTextContent('Jamie');
      expect(matches).not.toHaveTextContent('Taylor');
    });

    it('shows everyone again when switching back to "All"', async () => {
      const user = userEvent.setup();
      render(<RomanticInterestChatLauncher characters={characters} onContinue={vi.fn()} />);
      await user.click(screen.getByRole('button', { name: /add a new romantic interest/i }));
      await user.click(screen.getByRole('button', { name: 'Male' }));
      await user.click(screen.getByRole('button', { name: 'All' }));

      const matches = screen.getByLabelText('Character Book matches');
      expect(matches).toHaveTextContent('Alex');
      expect(matches).toHaveTextContent('Sam');
    });
  });
});
