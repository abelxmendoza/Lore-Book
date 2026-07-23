import userEvent from '@testing-library/user-event';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useMockData } from '../../contexts/MockDataContext';
import {
  CHATGPT_IMPORT_DEMO_COMPLETED_KEY,
  CHATGPT_IMPORT_DEMO_DISMISSED_KEY,
  openChatGPTImportDemo,
} from '../../lib/chatGPTImportDemo';
import { ChatGPTImportDemoSimulator } from './ChatGPTImportDemoSimulator';

vi.mock('../../contexts/MockDataContext', () => ({
  useMockData: vi.fn(),
}));

describe('ChatGPTImportDemoSimulator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(useMockData).mockReturnValue({
      runtimeDataMode: 'DEMO',
    } as ReturnType<typeof useMockData>);
  });

  it('runs the synthetic journey, remembers completion, and can be dismissed', async () => {
    const user = userEvent.setup();
    render(<ChatGPTImportDemoSimulator />);

    act(() => {
      openChatGPTImportDemo();
    });
    expect(screen.getByRole('dialog', { name: 'Import My ChatGPT Lore' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Simulate requesting my export' }));
    expect(screen.getByText('Reminder saved')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Pretend the export arrived' }));
    expect(screen.getByText('Synthetic export analyzed')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Build review proposals' }));
    expect(screen.getByText('I built MemoVault as my main project.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Finish simulation' }));
    expect(screen.getByText('Simulation complete')).toBeInTheDocument();
    expect(localStorage.getItem(CHATGPT_IMPORT_DEMO_COMPLETED_KEY)).toBe('true');

    await user.click(screen.getByRole('button', { name: 'Done — dismiss this demo' }));
    expect(screen.queryByText('Try the ChatGPT lore import')).not.toBeInTheDocument();
    expect(localStorage.getItem(CHATGPT_IMPORT_DEMO_DISMISSED_KEY)).toBe('true');
  });

  it('can always be replayed from the demo-bar event after dismissal', () => {
    localStorage.setItem(CHATGPT_IMPORT_DEMO_COMPLETED_KEY, 'true');
    localStorage.setItem(CHATGPT_IMPORT_DEMO_DISMISSED_KEY, 'true');
    render(<ChatGPTImportDemoSimulator />);

    expect(screen.queryByText('ChatGPT import demo completed')).not.toBeInTheDocument();
    act(() => {
      openChatGPTImportDemo();
    });

    expect(screen.getByRole('dialog', { name: 'Import My ChatGPT Lore' })).toBeInTheDocument();
  });

  it('never renders outside demo mode', () => {
    vi.mocked(useMockData).mockReturnValue({
      runtimeDataMode: 'REAL',
    } as ReturnType<typeof useMockData>);
    const { container } = render(<ChatGPTImportDemoSimulator />);
    expect(container).toBeEmptyDOMElement();
  });
});
