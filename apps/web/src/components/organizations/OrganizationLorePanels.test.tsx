import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import {
  OrganizationInfluencePanel,
  OrganizationInsightsPanel,
  OrganizationLorePanel,
} from './OrganizationLorePanels';
import type { OrgWorldInput } from '../../lib/organizationLore';

const vanguard: OrgWorldInput = { name: 'Vanguard Robotics', group_type: 'company' };
const derivedOrg: OrgWorldInput = {
  name: 'Northwind Co',
  group_type: 'company',
  member_count: 3,
  analytics: { importance_score: 64, trend: 'increasing' },
};

describe('OrganizationInfluencePanel', () => {
  it('renders the curated impact score and skill chips', () => {
    render(<OrganizationInfluencePanel organization={vanguard} />);
    expect(screen.getByTestId('org-influence-panel')).toBeInTheDocument();
    expect(screen.getByText('88')).toBeInTheDocument();
    expect(screen.getByText('Foundational')).toBeInTheDocument();
    expect(screen.getByText('Robotics Operations')).toBeInTheDocument();
    expect(screen.getByText('Industry Connections')).toBeInTheDocument();
  });

  it('renders a derived impact band for an unknown org', () => {
    render(<OrganizationInfluencePanel organization={derivedOrg} />);
    expect(screen.getByText('64')).toBeInTheDocument();
    expect(screen.getByText('Significant')).toBeInTheDocument();
  });
});

describe('OrganizationInsightsPanel', () => {
  it('renders curated insights with their kind labels', () => {
    render(<OrganizationInsightsPanel organization={vanguard} />);
    expect(screen.getByTestId('org-insights-panel')).toBeInTheDocument();
    expect(screen.getByText(/strongest bridge between your service-industry/i)).toBeInTheDocument();
    expect(screen.getByText('Prediction')).toBeInTheDocument();
  });
});

describe('OrganizationLorePanel', () => {
  it('renders the archetype, themes, symbols and story role', () => {
    render(<OrganizationLorePanel organization={vanguard} />);
    expect(screen.getByTestId('org-lore-panel')).toBeInTheDocument();
    expect(screen.getByText('The Forge')).toBeInTheDocument();
    expect(screen.getByText('Training Ground')).toBeInTheDocument();
    expect(screen.getByText('Adaptation')).toBeInTheDocument();
    expect(screen.getByText('Robots')).toBeInTheDocument();
    expect(screen.getByText(/where the Builder first proved/i)).toBeInTheDocument();
  });
});
