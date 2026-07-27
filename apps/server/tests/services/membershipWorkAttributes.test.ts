import { describe, expect, it } from 'vitest';

import {
  resolveEmploymentMembershipRole,
  workAttributesFromEmploymentMembership,
} from '../../src/services/kinship/membershipWorkAttributes';

describe('membershipWorkAttributes', () => {
  it('treats employee (and close variants) as employment seats', () => {
    expect(resolveEmploymentMembershipRole('employee')).toBe('employee');
    expect(resolveEmploymentMembershipRole('Employee')).toBe('employee');
    expect(resolveEmploymentMembershipRole('intern')).toBe('intern');
    expect(resolveEmploymentMembershipRole('contractor')).toBe('contractor');
    expect(resolveEmploymentMembershipRole('member')).toBeNull();
    expect(resolveEmploymentMembershipRole('coworker')).toBeNull();
    expect(resolveEmploymentMembershipRole('manager')).toBeNull();
  });

  it('maps employee membership to workplace + occupation for Info Work', () => {
    expect(
      workAttributesFromEmploymentMembership({
        role: 'employee',
        organizationName: 'Vanguard Robotics',
      }),
    ).toEqual([
      { attributeType: 'workplace', attributeValue: 'Vanguard Robotics' },
      { attributeType: 'company', attributeValue: 'Vanguard Robotics' },
      { attributeType: 'occupation', attributeValue: 'Employee' },
      { attributeType: 'employment_status', attributeValue: 'employed' },
    ]);
  });

  it('returns nothing without an org name or employment role', () => {
    expect(
      workAttributesFromEmploymentMembership({
        role: 'employee',
        organizationName: '  ',
      }),
    ).toEqual([]);
    expect(
      workAttributesFromEmploymentMembership({
        role: 'member',
        organizationName: 'Vanguard Robotics',
      }),
    ).toEqual([]);
  });
});
