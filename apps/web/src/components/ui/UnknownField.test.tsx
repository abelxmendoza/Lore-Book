import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UnknownField } from './UnknownField';

describe('UnknownField', () => {
  it('renders the label with unknown copy and chat invite when interactive', () => {
    render(<UnknownField label="Role" prompt="Their role: " onAskInChat={() => undefined} />);
    expect(screen.getByText(/Role: unknown — tell Lorebook in chat/i)).toBeInTheDocument();
  });

  it('fires onAskInChat with the prompt on click', () => {
    const onAsk = vi.fn();
    render(<UnknownField label="Pronouns" prompt="Sarah's pronouns are " onAskInChat={onAsk} />);
    fireEvent.click(screen.getByTestId('unknown-field'));
    expect(onAsk).toHaveBeenCalledWith("Sarah's pronouns are ");
  });

  it('renders a non-interactive span without a handler', () => {
    render(<UnknownField label="Where" />);
    const el = screen.getByTestId('unknown-field');
    expect(el.tagName).toBe('SPAN');
    expect(screen.getByText(/Where: unknown$/i)).toBeInTheDocument();
  });

  it('compact variant shows just "Unknown"', () => {
    render(<UnknownField label="Role" compact />);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('prefers onActivate over chat and stops card click bubbling', () => {
    const onActivate = vi.fn();
    const onAsk = vi.fn();
    const parentClick = vi.fn();
    render(
      <div onClick={parentClick}>
        <UnknownField label="Role" compact onActivate={onActivate} onAskInChat={onAsk} actionHint="click to set" />
      </div>,
    );
    fireEvent.click(screen.getByTestId('unknown-field'));
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onAsk).not.toHaveBeenCalled();
    expect(parentClick).not.toHaveBeenCalled();
    expect(screen.getByTitle(/Role is not in your record yet — click to set/i)).toBeInTheDocument();
  });
});
