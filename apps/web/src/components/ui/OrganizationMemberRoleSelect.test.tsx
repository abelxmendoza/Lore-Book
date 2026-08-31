import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';

import { OrganizationMemberRoleSelect } from './OrganizationMemberRoleSelect';

describe('OrganizationMemberRoleSelect', () => {
  it('exposes seat/title presets in a real select (not a datalist)', async () => {
    const onChange = vi.fn();
    render(<OrganizationMemberRoleSelect value="" onChange={onChange} data-testid="role" />);

    const select = screen.getByTestId('role');
    expect(select.tagName).toBe('SELECT');
    expect(screen.getByRole('option', { name: 'Member' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Employee' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Leader' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Manager' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Founder' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Co-Founder' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Captain' })).toBeInTheDocument();

    expect(screen.queryByRole('option', { name: 'Coworker' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Colleague' })).not.toBeInTheDocument();

    expect(screen.getByTestId('role-hint')).toHaveTextContent(
      'Their role in this group — not how you know them.',
    );

    await userEvent.selectOptions(select, 'founder');
    expect(onChange).toHaveBeenCalledWith('founder');
  });

  it('limits household variant to home roles', () => {
    render(
      <OrganizationMemberRoleSelect
        variant="household"
        value="lives here"
        onChange={vi.fn()}
        data-testid="role"
      />,
    );

    expect(screen.getByRole('option', { name: 'Lives Here' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Weekends' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Head Of Household' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Member' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Founder' })).not.toBeInTheDocument();
    expect(screen.getByTestId('role-hint')).toHaveTextContent(
      'How they belong in this home — a person can also belong to another household.',
    );
  });

  it('opens Custom mode for legacy relationship roles like coworker', () => {
    render(<OrganizationMemberRoleSelect value="coworker" onChange={vi.fn()} data-testid="role" />);
    expect(screen.getByTestId('role')).toHaveValue('__custom__');
    expect(screen.getByTestId('role-custom')).toHaveValue('coworker');
  });

  it('lets users enter a custom role', async () => {
    const onChange = vi.fn();
    render(<OrganizationMemberRoleSelect value="" onChange={onChange} data-testid="role" />);

    await userEvent.selectOptions(screen.getByTestId('role'), '__custom__');
    const custom = await screen.findByTestId('role-custom');
    await userEvent.type(custom, 'Producer');
    expect(onChange).toHaveBeenCalledWith('P');
  });

  it('keeps the custom input open when replacing an existing preset role', async () => {
    function ControlledRolePicker() {
      const [role, setRole] = useState('member');
      return (
        <OrganizationMemberRoleSelect
          value={role}
          onChange={setRole}
          data-testid="role"
        />
      );
    }

    render(<ControlledRolePicker />);

    await userEvent.selectOptions(screen.getByTestId('role'), '__custom__');
    const custom = await screen.findByTestId('role-custom');
    await userEvent.type(custom, 'Producer');

    expect(custom).toHaveValue('Producer');
    expect(screen.getByTestId('role')).toHaveValue('__custom__');
  });

  it('maps case variants of presets onto the select value', () => {
    render(<OrganizationMemberRoleSelect value="Co-Founder" onChange={vi.fn()} data-testid="role" />);
    expect(screen.getByTestId('role')).toHaveValue('co-founder');
  });
});
