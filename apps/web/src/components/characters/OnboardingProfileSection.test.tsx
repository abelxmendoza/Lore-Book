import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OnboardingProfileSection } from './OnboardingProfileSection';

describe('OnboardingProfileSection', () => {
  it('renders identity + populated chip groups from the onboarding profile', () => {
    render(
      <OnboardingProfileSection
        profile={{
          identity: { occupation: 'Engineer', lifePhase: 'building a startup' },
          goals: [{ label: 'Launch this year' }],
          people: [{ label: 'Sarah' }],
          skills: [{ label: 'Robotics' }],
          places: [],
          organizations: [],
          interests: [],
          projects: [],
          events: [],
          values: [],
        }}
      />,
    );
    expect(screen.getByText('From your story')).toBeTruthy();
    expect(screen.getByText('Engineer')).toBeTruthy();
    expect(screen.getByText('building a startup')).toBeTruthy();
    expect(screen.getByText('Launch this year')).toBeTruthy();
    expect(screen.getByText('Sarah')).toBeTruthy();
    expect(screen.getByText('Robotics')).toBeTruthy();
    // empty groups are not rendered
    expect(screen.queryByText(/Life events/i)).toBeNull();
  });

  it('renders nothing when there is no profile or it is empty', () => {
    const { container: c1 } = render(<OnboardingProfileSection profile={null} />);
    expect(c1.firstChild).toBeNull();

    const { container: c2 } = render(
      <OnboardingProfileSection profile={{ identity: {}, people: [], goals: [] }} />,
    );
    expect(c2.firstChild).toBeNull();
  });
});
