/**
 * Stage structured resume attributes as reviewable evidence for the self character.
 */
import { entityAttributeDetector, type DetectedAttribute } from '../conversationCentered/entityAttributeDetector';
import { logger } from '../../logger';
import { normalizeResumeDate } from './resumeDateUtils';
import type { ParsedResume } from './resumeStructuredTypes';

function cityFromAddress(address?: string): string | null {
  if (!address) return null;
  const match = address.match(/([A-Za-z][A-Za-z\s.'-]+),\s*([A-Z]{2})\b/);
  return match ? `${match[1].trim()}, ${match[2]}` : address.split(',')[0]?.trim() || null;
}

function resumeEvidence(sourceFileId: string): DetectedAttribute['evidenceSourceIds'] {
  return [`resume:${sourceFileId}`];
}

class ResumeCharacterEnrichmentService {
  async enrichSelfFromResume(
    userId: string,
    parsed: ParsedResume,
    context: { sourceFileId: string; fileName: string }
  ): Promise<{ characterId: string | null; attributes: number }> {
    const selfRef = await entityAttributeDetector.ensureUserCharacter(userId);
    if (!selfRef) return { characterId: null, attributes: 0 };

    const characterId = selfRef.id;
    let attributeCount = 0;

    const attrs: Array<Omit<DetectedAttribute, 'entityId' | 'entityType'>> = [];

    for (const job of parsed.employment) {
      attrs.push({
        attributeType: 'occupation',
        attributeValue: job.title,
        confidence: job.isCurrent ? 0.95 : 0.82,
        isCurrent: Boolean(job.isCurrent),
        startTime: normalizeResumeDate(job.startDate) ?? undefined,
        endTime: job.isCurrent ? undefined : normalizeResumeDate(job.endDate) ?? undefined,
        evidence: `Resume: ${job.title} at ${job.company}`,
        evidenceSourceIds: resumeEvidence(context.sourceFileId),
      });
      attrs.push({
        attributeType: 'workplace',
        attributeValue: job.company,
        confidence: job.isCurrent ? 0.94 : 0.8,
        isCurrent: Boolean(job.isCurrent),
        startTime: normalizeResumeDate(job.startDate) ?? undefined,
        endTime: job.isCurrent ? undefined : normalizeResumeDate(job.endDate) ?? undefined,
        evidence: `Resume employer: ${job.company}`,
        evidenceSourceIds: resumeEvidence(context.sourceFileId),
      });
    }

    for (const edu of parsed.education) {
      if (edu.institution) {
        attrs.push({
          attributeType: 'school',
          attributeValue: edu.institution,
          confidence: 0.9,
          isCurrent: false,
          evidence: `Resume education: ${edu.institution}`,
          evidenceSourceIds: resumeEvidence(context.sourceFileId),
        });
      }
      if (edu.degree) {
        attrs.push({
          attributeType: 'degree',
          attributeValue: edu.degree,
          confidence: 0.9,
          isCurrent: false,
          evidence: `Resume degree: ${edu.degree}`,
          evidenceSourceIds: resumeEvidence(context.sourceFileId),
        });
      }
    }

    for (const cert of parsed.certifications.slice(0, 6)) {
      attrs.push({
        attributeType: 'certification',
        attributeValue: cert.name,
        confidence: 0.88,
        isCurrent: true,
        evidence: `Resume certification: ${cert.name}`,
        evidenceSourceIds: resumeEvidence(context.sourceFileId),
      });
    }

    for (const skill of parsed.skills.slice(0, 12)) {
      attrs.push({
        attributeType: 'skill',
        attributeValue: skill,
        confidence: 0.85,
        isCurrent: true,
        evidence: `Resume skill: ${skill}`,
        evidenceSourceIds: resumeEvidence(context.sourceFileId),
      });
    }

    const city = cityFromAddress(parsed.contact.address);
    if (city) {
      attrs.push({
        attributeType: 'current_city',
        attributeValue: city,
        confidence: 0.86,
        isCurrent: true,
        evidence: `Resume contact address: ${parsed.contact.address}`,
        evidenceSourceIds: resumeEvidence(context.sourceFileId),
      });
    }

    for (const attr of attrs) {
      try {
        await entityAttributeDetector.saveAttribute(userId, {
          ...attr,
          metadata: {
            source: 'resume_upload',
            source_file_id: context.sourceFileId,
            file_name: context.fileName,
            review_state: 'pending',
            review_required: true,
          },
          entityId: characterId,
          entityType: 'character',
        });
        attributeCount++;
      } catch (err) {
        logger.warn({ err, attr: attr.attributeType }, 'resume enrich: attribute save skipped');
      }
    }

    return { characterId, attributes: attributeCount };
  }
}

export const resumeCharacterEnrichmentService = new ResumeCharacterEnrichmentService();
