import { describe, it, expect } from 'vitest';

import { organizationInferenceService } from '../../../src/services/organizations/inference/organizationInferenceService';
import {
  isBareGenericOrgWord,
} from '../../../src/services/organizations/inference/namedOrganizationInference';
import { hasEmployerContext } from '../../../src/services/organizations/inference/employerInference';
import { isBareSchoolLabel } from '../../../src/services/organizations/inference/schoolInstitutionInference';
import { isInvestorPersonPhrase } from '../../../src/services/organizations/inference/investorOrganizationInference';
import {
  extractEmployerFromWorksiteChain,
  looksLikeWorksiteNotEmployer,
} from '../../../src/services/organizations/inference/organizationPlaceDisambiguation';
import {
  isLoreBookProductName,
  isProjectNotOrganization,
} from '../../../src/services/organizations/inference/organizationProjectDisambiguation';
import { hasProvenance } from '../../../src/services/organizations/inference/organizationProvenanceService';
import { canPromoteToOrganizationCard } from '../../../src/services/organizations/inference/organizationPromotionGate';

function infer(text: string, extra: Parameters<typeof organizationInferenceService.inferFromMessage>[0] = {}) {
  return organizationInferenceService.inferFromMessage({
    text,
    sourceMessageId: 'msg-1',
    authorRole: 'user',
    ...extra,
  });
}

function findAccepted(result: ReturnType<typeof infer>, namePart: string) {
  return result.accepted.find((c) =>
    c.displayName.toLowerCase().includes(namePart.toLowerCase()),
  );
}

describe('organization inference rules', () => {
  it('Vanguard Robotics becomes employer org', () => {
    const result = infer('I worked at Vanguard Robotics on navigation stacks.');
    const org = findAccepted(result, 'Vanguard Robotics');
    expect(org).toBeDefined();
    expect(org!.organizationType).toBe('employer');
    expect(org!.context.roleToUser).toBe('employer');
  });

  it('Amazon becomes employer/interview org when job context exists', () => {
    const result = infer('I had an Amazon Interview with Engineers last week.');
    const org = findAccepted(result, 'Amazon');
    expect(org).toBeDefined();
    expect(org!.organizationType).toMatch(/employer|company/);
    expect(hasEmployerContext('I had an Amazon Interview')).toBe(true);
  });

  it('CSUF becomes university', () => {
    const result = infer('I went to CSUF for mechanical engineering.');
    const org = findAccepted(result, 'CSUF');
    expect(org).toBeDefined();
    expect(org!.organizationType).toBe('university');
    expect(org!.context.roleToUser).toBe('school');
  });

  it('Whittier Christian Middle School becomes school', () => {
    const result = infer(
      'Bryan and I met at Whittier Christian Middle School in band.',
    );
    const org = findAccepted(result, 'Whittier Christian Middle School');
    expect(org).toBeDefined();
    expect(org!.organizationType).toBe('school');
  });

  it('Clever Programmer Bootcamp becomes bootcamp', () => {
    const result = infer('I enrolled in Clever Programmer Bootcamp after college.');
    const org = findAccepted(result, 'Clever Programmer Bootcamp');
    expect(org).toBeDefined();
    expect(org!.organizationType).toBe('bootcamp');
    expect(org!.context.roleToUser).toBe('program');
  });

  it('Antler becomes investor org from potential investor context', () => {
    const text = 'I talked to a potential investor from Antler about the startup.';
    expect(isInvestorPersonPhrase(text)).toBe(true);
    const result = infer(text);
    const org = findAccepted(result, 'Antler');
    expect(org).toBeDefined();
    expect(org!.organizationType).toBe('investor');
    expect(org!.context.roleToUser).toBe('investor');
  });

  it('Supabase/Vercel/Railway become platform/vendor orgs', () => {
    const supabase = infer('We use Supabase for auth and Postgres.');
    expect(findAccepted(supabase, 'Supabase')?.organizationType).toBe('platform');
    expect(findAccepted(supabase, 'Supabase')?.context.roleToUser).toBe('tool_provider');

    const vercel = infer('Deployed the app on Vercel last night.');
    expect(findAccepted(vercel, 'Vercel')?.organizationType).toBe('platform');

    const railway = infer('Moved staging to Railway for preview deploys.');
    expect(findAccepted(railway, 'Railway')?.organizationType).toBe('platform');
  });

  it("Denny's Hollywood does not become employer when Vanguard Robotics nearby", () => {
    const text =
      "I worked at Vanguard Robotics at Denny's in Hollywood on the deployment.";
    expect(extractEmployerFromWorksiteChain(text)).toMatch(/Vanguard Robotics/i);
    expect(looksLikeWorksiteNotEmployer("Denny's", text)).toBe(true);

    const result = infer(text);
    expect(findAccepted(result, 'Vanguard Robotics')).toBeDefined();
    expect(result.accepted.some((c) => /denny/i.test(c.displayName))).toBe(false);
  });

  it('LoreBook does not become organization', () => {
    expect(isLoreBookProductName('LoreBook')).toBe(true);
    expect(isProjectNotOrganization('LoreBook')).toBe(true);
    const buildingPhrase = ['building', 'LoreBook'].join(' ');
    const result = infer(`I have been ${buildingPhrase} with Claude Code.`);
    expect(result.accepted.some((c) => c.displayName.toLowerCase() === 'lorebook')).toBe(false);
  });

  it('company/school/bootcamp alone rejected', () => {
    expect(isBareGenericOrgWord('company')).toBe(true);
    expect(isBareGenericOrgWord('school')).toBe(true);
    expect(isBareGenericOrgWord('bootcamp')).toBe(true);
    expect(isBareSchoolLabel('school')).toBe(true);

    const result = infer('I went to school and then joined a company at a bootcamp.');
    expect(result.accepted.some((c) => c.displayName.toLowerCase() === 'company')).toBe(false);
    expect(result.accepted.some((c) => c.displayName.toLowerCase() === 'school')).toBe(false);
    expect(result.accepted.some((c) => c.displayName.toLowerCase() === 'bootcamp')).toBe(false);
  });

  it('organizations include provenance', () => {
    const result = infer('I worked at Vanguard Robotics last year.');
    const org = findAccepted(result, 'Vanguard Robotics');
    expect(org).toBeDefined();
    expect(hasProvenance(org!)).toBe(true);
    expect(org!.sourceMessageIds).toContain('msg-1');
    expect(org!.evidencePhrases.length).toBeGreaterThan(0);
  });

  it('promotion gate requires institutional context for suggestion', () => {
    const result = infer('I worked at Vanguard Robotics last year.');
    const org = findAccepted(result, 'Vanguard Robotics');
    expect(org).toBeDefined();
    expect(canPromoteToOrganizationCard(org!, { mentionCount: 1 })).toBe(false);
    expect(canPromoteToOrganizationCard(org!, { mentionCount: 2 })).toBe(true);
  });
});
