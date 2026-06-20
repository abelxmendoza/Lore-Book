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

// Logged-in users have real orgs (no curated/demo world): every panel must still
// render meaningful DERIVED content and never crash on a sparse record.
describe('logged-in users (derived world, no demo data)', () => {
  const sparseRealOrg: OrgWorldInput = { name: 'Acme Holdings' }; // minimal: no type/analytics/members

  it('Influence renders a derived impact band + skills for a bare org', () => {
    render(<OrganizationInfluencePanel organization={sparseRealOrg} />);
    expect(screen.getByTestId('org-influence-panel')).toBeInTheDocument();
    // Some skills-gained chip is always present (no "Nothing tracked yet" empty state).
    expect(screen.queryByText(/Nothing tracked yet/i)).not.toBeInTheDocument();
  });

  it('Insights renders at least one derived observation', () => {
    render(<OrganizationInsightsPanel organization={sparseRealOrg} />);
    expect(screen.getByTestId('org-insights-panel')).toBeInTheDocument();
    expect(screen.queryByText(/No insights yet/i)).not.toBeInTheDocument();
  });

  it('Lore renders a derived archetype + role in story', () => {
    render(<OrganizationLorePanel organization={sparseRealOrg} />);
    expect(screen.getByTestId('org-lore-panel')).toBeInTheDocument();
    expect(screen.getByText('The Waypoint')).toBeInTheDocument(); // 'other' archetype preset
    expect(screen.getByText(/Acme Holdings/)).toBeInTheDocument();
  });
});

// Guard: the differentiator tabs ship to ALL users (in the base tab set, not
// behind a demo flag), so they can't silently regress out for logged-in users.
describe('organization modal tabs reach logged-in users', () => {
  it('includes Influence, Insights and Lore in the base tab set', async () => {
    const { ORG_MODAL_BASE_TABS } = await import('./OrganizationModalNav');
    const keys = ORG_MODAL_BASE_TABS.map((t) => t.key);
    expect(keys).toEqual(expect.arrayContaining(['influence', 'insights', 'lore']));
  });
});
