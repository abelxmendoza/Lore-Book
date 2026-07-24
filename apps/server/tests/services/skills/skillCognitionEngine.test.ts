import { describe, expect, it } from 'vitest';
import { skillCognitionEngine } from '../../../src/services/skills/skillCognitionEngine';
import { planSkillDuplicateMerges } from '../../../src/services/skills/migration/skillDuplicatePlanner';
import { auditSkillBook } from '../../../src/services/skills/migration/skillBookAudit';

describe('SkillCognitionEngine v1', () => {
  describe('ownership gate', () => {
    it('does not assign Ravi Electrical Engineering to the user', () => {
      const r = skillCognitionEngine.evaluate({
        span: 'Electrical Engineering',
        evidenceText: "Ravi earned a master's degree in Electrical Engineering.",
        sourceType: 'chat',
        proposedProficiency: 88,
        proposedConfidence: 0.9,
      });
      expect(r.subject.subjectType).toBe('OTHER_PERSON');
      expect(r.subject.subjectName).toMatch(/Ravi/i);
      expect(r.status).toBe('rejected');
      expect(r.decision).toBe('REJECT');
      expect(r.rejectionReason).toBe('other_person_ownership');
      expect(r.proficiency.label).toBe('UNKNOWN');
    });

    it('does not assign Priya AI specialty to the user', () => {
      const r = skillCognitionEngine.evaluate({
        span: 'Artificial Intelligence',
        evidenceText: 'Priya is a USC master\'s graduate specializing in AI.',
        sourceType: 'chat',
        proposedProficiency: 86,
      });
      expect(r.subject.subjectType).toBe('OTHER_PERSON');
      expect(r.status).toBe('rejected');
      expect(r.decision).toBe('REJECT');
    });

    it('does not infer Failure Analysis from Morgan running the department', () => {
      const r = skillCognitionEngine.evaluate({
        span: 'Failure Analysis',
        evidenceText: 'Morgan runs the Failure Analysis department.',
        sourceType: 'chat',
        proposedProficiency: 85,
      });
      expect(r.subject.subjectType).toBe('OTHER_PERSON');
      expect(r.status).toBe('rejected');
    });

    it('accepts first-person demonstration of Failure Analysis', () => {
      const r = skillCognitionEngine.evaluate({
        span: 'Failure Analysis',
        evidenceText:
          'I investigated four Osprey devices and traced the failures to memory-pool exhaustion.',
        sourceType: 'chat',
        knownSkills: [],
      });
      expect(r.subject.subjectType).toBe('USER');
      expect(r.status).toBe('accepted');
      expect(['CREATE', 'ADD_AS_CHILD_SKILL']).toContain(r.decision);
      expect(r.evidenceStrength).toBe('DIRECT_DEMONSTRATION');
      expect(r.proficiency.label).not.toBe('UNKNOWN');
    });

    it('accepts user AI-assisted coding when first-person', () => {
      const r = skillCognitionEngine.evaluate({
        span: 'AI Coding Tools',
        evidenceText: 'I used AI tools to build LoreBook.',
        sourceType: 'chat',
        knownSkills: [{ name: 'AI-Assisted Coding' }],
      });
      expect(r.subject.subjectType).toBe('USER');
      expect(r.canonicalTitle).toBe('AI-Assisted Coding');
      expect(r.status === 'accepted' || r.status === 'merged').toBe(true);
      expect(r.projectLinks).toContain('LoreBook');
    });
  });

  describe('fiction / role-play gate', () => {
    it('rejects Team Magma leadership as real skill', () => {
      const r = skillCognitionEngine.evaluate({
        span: 'Leadership',
        evidenceText: 'I took over Team Magma and removed Maxie.',
        sourceType: 'chat',
        proposedProficiency: 78,
      });
      expect(r.realityContext === 'FICTION' || r.realityContext === 'ROLEPLAY').toBe(true);
      expect(r.status).toBe('rejected');
      expect(r.decision).toBe('REJECT');
    });
  });

  describe('ontology routing', () => {
    it('routes LoreBook as PROJECT not skill', () => {
      const r = skillCognitionEngine.evaluate({
        span: 'LoreBook',
        evidenceText: 'I worked on LoreBook all day.',
        sourceType: 'chat',
      });
      expect(r.entityType).toBe('PROJECT');
      expect(r.decision).toBe('ROUTE_TO_OTHER_ONTOLOGY');
      expect(r.status).toBe('routed');
    });

    it('routes clubbing as activity', () => {
      const r = skillCognitionEngine.evaluate({
        span: 'Clubbing',
        evidenceText: 'I went clubbing at Catch One.',
        sourceType: 'chat',
      });
      expect(r.entityType === 'ACTIVITY' || r.entityType === 'HOBBY').toBe(true);
      expect(r.decision).toBe('ROUTE_TO_OTHER_ONTOLOGY');
    });

    it('routes family caregiving as responsibility cluster', () => {
      const r = skillCognitionEngine.evaluate({
        span: 'Family Care Coordination',
        evidenceText: 'I drove my uncle to his doctor appointment.',
        sourceType: 'chat',
      });
      expect(r.entityType).toBe('RESPONSIBILITY');
      expect(r.decision).toBe('ROUTE_TO_OTHER_ONTOLOGY');
    });

    it('routes bare Muay Thai mention away from confident skill', () => {
      const r = skillCognitionEngine.evaluate({
        span: 'Muay Thai',
        evidenceText: 'muay thai',
        sourceType: 'chat',
        proposedConfidence: 0.89,
        proposedProficiency: 70,
      });
      // bare mention → activity or reject weak evidence
      expect(
        r.entityType === 'ACTIVITY'
        || r.status === 'rejected'
        || r.decision === 'ROUTE_TO_OTHER_ONTOLOGY'
        || r.evidenceStrength === 'BARE_MENTION',
      ).toBe(true);
      expect(r.usageFrequency === 'OBSERVED_ONCE' || r.usageFrequency === 'UNKNOWN').toBe(true);
      expect(r.trajectory).toBe('UNKNOWN');
    });
  });

  describe('canonical merge', () => {
    it('merges AI Coding Tools into AI-Assisted Coding', () => {
      const r = skillCognitionEngine.evaluate({
        span: 'AI Coding Tools',
        evidenceText: 'I debug production issues with AI coding tools every week while building features.',
        knownSkills: [{ name: 'AI-Assisted Coding', aliases: ['AI Coding Tools'] }],
      });
      expect(r.canonicalTitle).toBe('AI-Assisted Coding');
      expect(r.matchExistingName).toBe('AI-Assisted Coding');
      expect(['AUTO_MERGE', 'SUGGEST_MERGE', 'ADD_AS_ALIAS']).toContain(r.decision);
    });

    it('merges Frontend Development into Front-End Development', () => {
      const r = skillCognitionEngine.evaluate({
        span: 'Frontend Development',
        evidenceText: 'I built the frontend for our app in React and shipped it.',
        knownSkills: [{ name: 'Front-End Development' }],
      });
      expect(r.canonicalTitle).toBe('Front-End Development');
      expect(r.matchExistingName).toBe('Front-End Development');
    });

    it('merges Debugging into Software Debugging', () => {
      const r = skillCognitionEngine.evaluate({
        span: 'Debugging',
        evidenceText: 'I debugged a race condition in the chat pipeline today.',
        knownSkills: [{ name: 'Software Debugging' }],
      });
      expect(r.canonicalTitle).toBe('Software Debugging');
      expect(r.matchExistingName).toBe('Software Debugging');
    });
  });

  describe('calibration', () => {
    it('one interview mention → OBSERVED_ONCE / UNKNOWN trajectory', () => {
      const r = skillCognitionEngine.evaluate({
        span: 'Interviewing',
        evidenceText: 'I interviewed today.',
        sourceType: 'chat',
      });
      expect(r.subject.subjectType).toBe('USER');
      expect(r.usageFrequency).toBe('OBSERVED_ONCE');
      expect(r.trajectory).toBe('UNKNOWN');
    });

    it('single self-report does not invent precise proficiency 78', () => {
      const r = skillCognitionEngine.evaluate({
        span: 'React',
        evidenceText: 'I know some React.',
        sourceType: 'chat',
        proposedProficiency: 78,
      });
      expect(r.proficiency.label === 'UNKNOWN' || r.proficiency.label === 'BEGINNER' || r.proficiency.label === 'DEVELOPING').toBe(true);
      // Must not echo the invented 78 without strong evidence
      expect(r.proficiency.score === undefined || r.proficiency.score !== 78).toBe(true);
    });

    it('does not mark potentially_paid from leisure activities', () => {
      const r = skillCognitionEngine.evaluate({
        span: 'One Piece Character Analysis',
        evidenceText: 'I thought Zoro would win that fight.',
        proposedMonetization: 'potentially_paid',
      });
      expect(r.monetization === 'hobby_only' || r.monetization === 'not_applicable' || r.monetization === 'unknown' || r.status !== 'accepted').toBe(true);
      expect(r.entityType === 'INTEREST' || r.decision === 'ROUTE_TO_OTHER_ONTOLOGY' || r.status === 'rejected').toBe(true);
    });
  });

  describe('same-source dedup', () => {
    it('collapses multi-extractor same message into one practice event', () => {
      const r = skillCognitionEngine.evaluate({
        span: 'Software Debugging',
        evidenceText: 'I debugged the LoreBook ingestion pipeline for hours.',
        sourceMessageId: 'msg-1',
        practiceEventAts: ['2026-07-01T10:00:00Z', '2026-07-01T10:00:00Z'],
      });
      // usage should still be once without multi-day evidence
      expect(r.usageFrequency === 'OBSERVED_ONCE' || r.usageFrequency === 'RARE').toBe(true);
    });
  });

  describe('migration planner', () => {
    it('plans merges for AI coding and frontend duplicates', () => {
      const plan = planSkillDuplicateMerges([
        { id: '1', skill_name: 'AI Coding Tools' },
        { id: '2', skill_name: 'AI-Assisted Coding' },
        { id: '3', skill_name: 'Frontend Development' },
        { id: '4', skill_name: 'Front-End Development' },
        { id: '5', skill_name: 'Lorebook' },
        { id: '6', skill_name: 'Clubbing' },
      ]);
      expect(plan.some((p) => p.decision === 'MERGE' && /AI/i.test(p.targetName ?? ''))).toBe(true);
      expect(plan.some((p) => p.decision === 'DEMOTE_TO_PROJECT')).toBe(true);
      expect(plan.some((p) => p.decision === 'DEMOTE_TO_ACTIVITY')).toBe(true);
    });

    it('merges Coding and Product iteration into one Software Product Development survivor', () => {
      const plan = planSkillDuplicateMerges([
        { id: 'c1', skill_name: 'Coding' },
        { id: 'p1', skill_name: 'Product iteration' },
      ]);
      const merges = plan.filter((p) => p.decision === 'MERGE');
      const renames = plan.filter((p) => p.decision === 'RENAME');
      expect(renames.some((p) => p.targetName === 'Software Product Development')).toBe(true);
      expect(merges.every((p) => p.targetName === 'Software Product Development')).toBe(true);
      expect(merges).toHaveLength(1);
      // Exactly one survivor rename, one merge — no A↔B mutual merge
      expect(plan.filter((p) => p.skillId === 'c1' || p.skillId === 'p1')).toHaveLength(2);
    });

    it('audit flags other-person Electrical Engineering', () => {
      const summary = auditSkillBook('user-1', [
        {
          id: 'ee-1',
          skill_name: 'Electrical Engineering',
          description: "Ravi earned a master's degree in Electrical Engineering.",
        },
        {
          id: 'ok-1',
          skill_name: 'Software Debugging',
          description: 'I debugged production crashes for two weeks.',
        },
      ]);
      const ee = summary.items.find((i) => i.skillId === 'ee-1');
      expect(ee?.decision).toBe('ARCHIVE_OTHER_PERSON');
    });
  });
});
