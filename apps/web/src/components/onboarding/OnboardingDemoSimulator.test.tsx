import userEvent from '@testing-library/user-event';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatGPTImportDemoSimulator } from '../account/ChatGPTImportDemoSimulator';
import { useMockData } from '../../contexts/MockDataContext';
import {
  ONBOARDING_DEMO_COMPLETED_KEY,
  ONBOARDING_DEMO_DISMISSED_KEY,
  openOnboardingDemo,
} from '../../lib/onboardingDemo';
import { OnboardingDemoSimulator } from './OnboardingDemoSimulator';

vi.mock('../../contexts/MockDataContext', () => ({
  useMockData: vi.fn(),
}));

describe('OnboardingDemoSimulator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(useMockData).mockReturnValue({
      runtimeDataMode: 'DEMO',
    } as ReturnType<typeof useMockData>);
  });

  it('shows that a user can start fresh and still reach a useful profile', async () => {
    const user = userEvent.setup();
    render(<OnboardingDemoSimulator />);

    await user.click(screen.getByText('See how LoreBook learns your story'));
    await user.click(screen.getByRole('button', { name: 'Try the onboarding paths' }));
    await user.click(screen.getByRole('button', { name: /I’m starting fresh/i }));
    await user.click(screen.getByRole('button', { name: 'Remember the people who matter' }));
    await user.click(screen.getByRole('button', { name: 'Create the Life Snapshot' }));

    expect(screen.getByText('Guided Life Snapshot')).toBeInTheDocument();
    expect(screen.getByText('Jamie is someone important.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Continue into Chat' }));
    expect(screen.getByText('Onboarding simulation complete')).toBeInTheDocument();
    expect(localStorage.getItem(ONBOARDING_DEMO_COMPLETED_KEY)).toBe('true');

    await user.click(screen.getByRole('button', { name: 'Done — dismiss onboarding demo' }));
    expect(localStorage.getItem(ONBOARDING_DEMO_DISMISSED_KEY)).toBe('true');
    expect(screen.queryByText('Onboarding simulation completed')).not.toBeInTheDocument();
  });

  it('folds the ChatGPT export simulation into the AI-history path', async () => {
    const user = userEvent.setup();
    render(
      <>
        <OnboardingDemoSimulator />
        <ChatGPTImportDemoSimulator />
      </>,
    );

    act(() => {
      openOnboardingDemo();
    });
    await user.click(screen.getByRole('button', { name: 'Try the onboarding paths' }));
    await user.click(screen.getByRole('button', { name: /AI conversation history/i }));
    await user.click(screen.getByRole('button', { name: /ChatGPT export/i }));

    expect(screen.getByRole('dialog', { name: 'Import My ChatGPT Lore' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Simulate requesting my export' }));
    await user.click(screen.getByRole('button', { name: 'Pretend the export arrived' }));
    await user.click(screen.getByRole('button', { name: 'Build review proposals' }));
    await user.click(screen.getByRole('button', { name: 'Finish simulation' }));
    await user.click(screen.getByRole('button', { name: 'Continue onboarding' }));

    expect(screen.getByText('ChatGPT history')).toBeInTheDocument();
    expect(screen.getByText('1 assistant claim excluded')).toBeInTheDocument();
  });

  it('can be reopened from the demo bar after dismissal', () => {
    localStorage.setItem(ONBOARDING_DEMO_COMPLETED_KEY, 'true');
    localStorage.setItem(ONBOARDING_DEMO_DISMISSED_KEY, 'true');
    render(<OnboardingDemoSimulator />);

    act(() => {
      openOnboardingDemo();
    });
    expect(screen.getByRole('dialog', { name: 'Begin Your LoreBook' })).toBeInTheDocument();
  });
});
