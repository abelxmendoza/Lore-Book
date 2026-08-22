import { describe, expect, it } from 'vitest';

import {
  applyOrganizationAttributionCorrection,
  attributeOrganizationsInEvent,
  eventAcceptedForOrganization,
  explainOrganizationTimelineInclusion,
  subjectWhyIncludedForOrganization,
  type OrganizationCatalogEntry,
} from './organizationEventAttribution';

const ACME: OrganizationCatalogEntry = { id: 'org-acme', name: 'Acme', aliases: ['ACME'] };
const ACME_LABS: OrganizationCatalogEntry = {
  id: 'org-acme-labs',
  name: 'Acme Labs',
  parentGroupId: 'org-acme-holdings',
};
const ACME_HOLDINGS: OrganizationCatalogEntry = { id: 'org-acme-holdings', name: 'Acme Holdings' };
const TOOLX: OrganizationCatalogEntry = { id: 'org-toolx', name: 'ToolX', groupType: 'software' };
const NORTHWIND_U: OrganizationCatalogEntry = {
  id: 'org-northwind-u',
  name: 'Northwind University',
  aliases: ['NWU'],
};
const NORTHWIND_CREW: OrganizationCatalogEntry = { id: 'org-northwind-crew', name: 'Northwind Crew' };
const CATALOG = [ACME, ACME_LABS, ACME_HOLDINGS, TOOLX, NORTHWIND_U, NORTHWIND_CREW];

function rolesFor(text: string, orgId: string) {
  return attributeOrganizationsInEvent({ text, organizations: CATALOG })
    .filter((row) => row.organizationId === orgId);
}

describe('organization event attribution', () => {
  it('treats started working at Acme as employer association', () => {
    const [row] = rolesFor('I started working at Acme.', ACME.id);
    expect(row?.role).toBe('employer');
    expect(row?.acceptedForOrganizationTimeline).toBe(true);
    expect(row?.protagonistRelation).toBe(true);
    expect(row?.evidenceKind).toBe('explicit_work_phrase');
  });

  it('treats an interview with Acme as professional association', () => {
    const [row] = rolesFor('I interviewed with Acme.', ACME.id);
    expect(row?.role).toBe('interview_target');
    expect(row?.acceptedForOrganizationTimeline).toBe(true);
  });

  it('treats Acme hosted the event as host association', () => {
    const [row] = rolesFor('Acme hosted the event.', ACME.id);
    expect(row?.role).toBe('host');
    expect(row?.acceptedForOrganizationTimeline).toBe(true);
  });

  it('does not create protagonist membership when a friend works at Acme', () => {
    const [row] = rolesFor('My friend works at Acme.', ACME.id);
    expect(row?.protagonistRelation).toBe(false);
    expect(row?.acceptedForOrganizationTimeline).toBe(false);
    expect(row?.subjectCharacterHint).toMatch(/friend/i);
  });

  it('keeps thinking-about mentions as reference only', () => {
    const [row] = rolesFor('I was thinking about Acme.', ACME.id);
    expect(row?.role).toBe('referenced');
    expect(row?.acceptedForOrganizationTimeline).toBe(false);
  });

  it('treats used ToolX as software/tool, not employer', () => {
    const [row] = rolesFor('I used ToolX while building MemoVault.', TOOLX.id);
    expect(row?.role).toBe('software_tool');
    expect(row?.acceptedForOrganizationTimeline).toBe(false);
    expect(eventAcceptedForOrganization(rolesFor('I used ToolX.', TOOLX.id), TOOLX.id)).toBe(false);
  });

  it('keeps coworker graduation on the coworker, not protagonist education', () => {
    const [row] = rolesFor('Jamie graduated from Northwind University.', NORTHWIND_U.id);
    expect(row?.role).toBe('institution');
    expect(row?.protagonistRelation).toBe(false);
    expect(row?.acceptedForOrganizationTimeline).toBe(false);
  });

  it('links a department event directly to the department', () => {
    const [row] = rolesFor('The Failure Analysis Lab at Acme Labs tested these devices.', ACME_LABS.id);
    expect(row?.role).toBe('department');
    expect(row?.direct).toBe(true);
    expect(row?.acceptedForOrganizationTimeline).toBe(true);
  });

  it('derives parent context without making it identical to direct involvement', () => {
    const rows = attributeOrganizationsInEvent({
      text: 'The Failure Analysis Lab at Acme Labs tested these devices.',
      organizations: CATALOG,
    });
    const labs = rows.find((row) => row.organizationId === ACME_LABS.id);
    const parent = rows.find((row) => row.organizationId === ACME_HOLDINGS.id);
    expect(labs?.direct).toBe(true);
    expect(parent?.role).toBe('parent_context');
    expect(parent?.direct).toBe(false);
    expect(parent?.derivedFrom).toBe(ACME_LABS.id);
    expect(parent?.whyIncluded).toMatch(/Parent context/);
  });

  it('does not attach an unrelated person in the same message to the org', () => {
    const rows = attributeOrganizationsInEvent({
      text: 'I interviewed with Acme today.\nLater I was talking about Maya and a ska show.',
      organizations: CATALOG,
    });
    expect(rows.filter((row) => row.organizationId === ACME.id)[0]?.role).toBe('interview_target');
    expect(rows.some((row) => /maya|ska/i.test(row.organizationName))).toBe(false);
  });

  it('does not contaminate an unrelated group mentioned later in the thread', () => {
    const rows = attributeOrganizationsInEvent({
      text: 'Jamie recruits for Acme.\nNorthwind Crew came up later in the conversation.',
      organizations: CATALOG,
    });
    const crew = rows.find((row) => row.organizationId === NORTHWIND_CREW.id);
    expect(crew?.acceptedForOrganizationTimeline).not.toBe(true);
    expect(crew?.role).toBe('referenced');
    const acme = rows.find((row) => row.organizationId === ACME.id);
    expect(acme?.acceptedForOrganizationTimeline).toBe(false);
    expect(acme?.protagonistRelation).toBe(false);
  });

  it('lets a canonical organization id beat an alias/name heuristic', () => {
    const rows = attributeOrganizationsInEvent({
      text: 'Show notes',
      organizations: CATALOG,
      explicitOrganizationId: ACME_LABS.id,
    });
    expect(rows.find((row) => row.organizationId === ACME_LABS.id)?.evidenceKind).toBe('explicit_event_link');
    expect(rows.find((row) => row.organizationId === ACME.id)?.evidenceKind).not.toBe('explicit_event_link');
  });

  it('resolves an acronym alias to the same canonical organization', () => {
    const [row] = rolesFor('I interviewed with NWU.', NORTHWIND_U.id);
    expect(row?.organizationId).toBe(NORTHWIND_U.id);
    expect(row?.role).toBe('interview_target');
  });

  it('keeps similar organization names distinct', () => {
    const rows = attributeOrganizationsInEvent({
      text: 'Acme Labs hosted the demo.',
      organizations: CATALOG,
    });
    expect(rows.some((row) => row.organizationId === ACME_LABS.id && row.role === 'host')).toBe(true);
    expect(rows.some((row) => row.organizationId === ACME.id && row.acceptedForOrganizationTimeline)).toBe(false);
  });

  it('includes direct attributed events and excludes reference-only from timeline membership', () => {
    const work = attributeOrganizationsInEvent({
      text: 'I started working at Acme.',
      organizations: CATALOG,
    });
    const thought = attributeOrganizationsInEvent({
      text: 'I was thinking about Acme.',
      organizations: CATALOG,
    });
    expect(eventAcceptedForOrganization(work, ACME.id)).toBe(true);
    expect(eventAcceptedForOrganization(thought, ACME.id)).toBe(false);
    expect(subjectWhyIncludedForOrganization(thought, ACME.id)?.relation).toBe('INCIDENTAL_MENTION');
    expect(subjectWhyIncludedForOrganization(work, ACME.id)?.relation).toBe('DIRECT_EVENT');
  });

  it('keeps unresolved association unresolved', () => {
    const rows = attributeOrganizationsInEvent({
      text: 'I started working at UnknownCo.',
      organizations: CATALOG,
    });
    expect(rows.some((row) => row.organizationName === 'UnknownCo')).toBe(false);
    expect(eventAcceptedForOrganization(rows, 'missing')).toBe(false);
  });

  it('swaps organization on correction without dropping the attribution row', () => {
    const original = attributeOrganizationsInEvent({
      text: 'I started working at Acme.',
      organizations: CATALOG,
    });
    const corrected = applyOrganizationAttributionCorrection(original, {
      fromOrganizationId: ACME.id,
      toOrganizationId: ACME_LABS.id,
      toOrganizationName: 'Acme Labs',
    });
    expect(corrected.find((row) => row.organizationId === ACME_LABS.id)?.role).toBe('employer');
    expect(corrected.find((row) => row.organizationId === ACME.id && row.accepted)).toBeUndefined();
    expect(corrected[0]?.correctionHistory?.[0]?.action).toBe('swap');
  });

  it('retracts a false host/employer association', () => {
    const original = attributeOrganizationsInEvent({
      text: 'Acme hosted the event.',
      organizations: CATALOG,
    });
    const retracted = applyOrganizationAttributionCorrection(original, {
      retractOrganizationId: ACME.id,
      retractRole: 'host',
    });
    expect(retracted[0]?.rejected).toBe(true);
    expect(retracted[0]?.acceptedForOrganizationTimeline).toBe(false);
    expect(eventAcceptedForOrganization(retracted, ACME.id)).toBe(false);
  });

  it('explains why an event is on Acme Labs vs parent holdings', () => {
    const rows = attributeOrganizationsInEvent({
      text: 'The Failure Analysis Lab at Acme Labs tested these devices.',
      organizations: CATALOG,
    });
    const labs = explainOrganizationTimelineInclusion(rows, ACME_LABS.id);
    const parent = explainOrganizationTimelineInclusion(rows, ACME_HOLDINGS.id);
    expect(labs).toMatchObject({ role: 'department', direct: true, accepted: true });
    expect(parent).toMatchObject({ role: 'parent_context', direct: false, derivedFrom: ACME_LABS.id });
  });
});
