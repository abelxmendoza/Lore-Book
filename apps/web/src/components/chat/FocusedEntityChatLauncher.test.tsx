import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import { render, screen } from '../../test/utils';
import { FocusedEntityChatLauncher } from './FocusedEntityChatLauncher';
import { FOCUSED_ENTITY_CHAT_PRESETS } from './focusedEntityChatPresets';

describe('FocusedEntityChatLauncher', () => {
  const preset = FOCUSED_ENTITY_CHAT_PRESETS.characters;

  it('offers an existing book match instead of creating a duplicate', async () => {
    const user = userEvent.setup();
    const onContinue = vi.fn();

    render(
      <FocusedEntityChatLauncher
        options={[{ id: 'char-alex', name: 'Alex', aliases: ['Lex'] }]}
        copy={preset.copy}
        theme={preset.theme}
        icon={preset.icon}
        onContinue={onContinue}
      />,
    );

    await user.click(screen.getByRole('button', { name: /add someone in chat/i }));
    await user.type(screen.getByRole('textbox', { name: /character name/i }), 'Lex');
    await user.click(screen.getByRole('button', { name: /chat about alex/i }));

    expect(onContinue).toHaveBeenCalledWith({
      name: 'Alex',
      entity: { id: 'char-alex', name: 'Alex', aliases: ['Lex'] },
    });
  });

  it('makes the new-entity path explicit when there is no match', async () => {
    const user = userEvent.setup();
    const onContinue = vi.fn();

    render(
      <FocusedEntityChatLauncher
        options={[]}
        copy={preset.copy}
        theme={preset.theme}
        icon={preset.icon}
        onContinue={onContinue}
      />,
    );

    await user.click(screen.getByRole('button', { name: /add someone in chat/i }));
    await user.type(screen.getByRole('textbox', { name: /character name/i }), 'Jordan');
    await user.click(screen.getByRole('button', { name: /introduce jordan in chat/i }));

    expect(onContinue).toHaveBeenCalledWith({ name: 'Jordan', entity: undefined });
  });

  it('uses places-specific copy for the locations preset', async () => {
    const user = userEvent.setup();
    const locations = FOCUSED_ENTITY_CHAT_PRESETS.locations;

    render(
      <FocusedEntityChatLauncher
        options={[{ id: 'loc-1', name: 'Northwind Depot' }]}
        copy={locations.copy}
        theme={locations.theme}
        icon={locations.icon}
        onContinue={vi.fn()}
      />,
    );

    expect(screen.getByText('Somewhere on your map?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /add a place in chat/i }));
    expect(screen.getByLabelText('Places matches')).toHaveTextContent('Northwind Depot');
    expect(screen.getByText('In Places')).toBeInTheDocument();
  });
});
