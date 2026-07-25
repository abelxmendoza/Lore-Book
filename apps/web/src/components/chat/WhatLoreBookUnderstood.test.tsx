import { describe, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';

import { render, screen } from '../../test/utils';
import { WhatLoreBookUnderstood } from './WhatLoreBookUnderstood';

describe('WhatLoreBookUnderstood', () => {
  it('surfaces people, groups, and reflections for a multi-thread day', async () => {
    const user = userEvent.setup();
    render(
      <WhatLoreBookUnderstood
        messageContent={`I want to tell you about Jamie, Marcus's Social Worker, someone new in my life.
yeah thats Marcus's Social Worker Support Team
Maybe I do need a therapist or something lmao. nothing beats real people.`}
      />,
    );

    await user.click(screen.getByRole('button', { name: /what lorebook understood/i }));
    expect(screen.getByText(/Jamie/)).toBeInTheDocument();
    expect(screen.getByText(/Marcus's Social Worker Support Team/i)).toBeInTheDocument();
    expect(screen.getByText(/not a diagnosis/i)).toBeInTheDocument();
  });
});
