/**
 * Sync structured resume parse → self character row, entity_attributes, social metadata, blurbs.
 */
import { discoverEntities } from '../ontology/lexicalIntelligence';
import { characterBlurbService } from '../characters/characterBlurbService';
import { entityAttributeDetector, type DetectedAttribute } from '../conversationCentered/entityAttributeDetector';
import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { normalizeResumeDate } from './resumeDateUtils';
import type { ParsedResume } from './resumeStructuredTypes';

function splitFullName(fullName: string): { first: string; last: string | null } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: 'Me', last: null };
  if (parts.length === 1) return { first: parts[0], last: null };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

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
    const meta = { source: 'resume_upload', source_file_id: context.sourceFileId };
    let attributeCount = 0;

    const { data: existing } = await supabaseAdmin
      .from('characters')
      .select('metadata, name')
      .eq('id', characterId)
      .eq('user_id', userId)
      .single();

    const existingMeta = (existing?.metadata as Record<string, unknown>) ?? {};
    const fullName = parsed.contact.fullName?.trim();
    const { first, last } = fullName ? splitFullName(fullName) : { first: existing?.name ?? 'Me', last: null };

    const currentJob = parsed.employment.find((j) => j.isCurrent) ?? parsed.employment[0];
    const latestEdu = parsed.education[0];
    const city = cityFromAddress(parsed.contact.address);

    const roleTagline = currentJob
      ? `${currentJob.title} · ${currentJob.company}`
      : parsed.summary?.slice(0, 80) ?? 'Protagonist · Your story';

    const corpus = [
      parsed.summary ?? '',
      ...parsed.employment.map((j) => `${j.title} ${j.company} ${j.description ?? ''}`),
      ...parsed.skills,
      ...parsed.projects.map((p) => `${p.name} ${p.description ?? ''}`),
      ...parsed.education.map((e) => `${e.degree ?? ''} ${e.institution}`),
    ].join(' ');

    const discovered = discoverEntities(corpus);
    const ontologyTags = [
      ...new Set(discovered.map((d) => d.surface || d.name).filter(Boolean)),
    ].slice(0, 16);

    const social = {
      ...(typeof existingMeta.social_media === 'object' ? (existingMeta.social_media as Record<string, string>) : {}),
      ...(parsed.contact.email ? { email: parsed.contact.email } : {}),
      ...(parsed.contact.phone ? { phone: parsed.contact.phone } : {}),
      ...(parsed.contact.linkedin ? { linkedin: parsed.contact.linkedin } : {}),
      ...(parsed.contact.website ? { website: parsed.contact.website } : {}),
    };

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
          entityId: characterId,
          entityType: 'character',
        });
        attributeCount++;
      } catch (err) {
        logger.warn({ err, attr: attr.attributeType }, 'resume enrich: attribute save skipped');
      }
    }

    await supabaseAdmin
      .from('characters')
      .update({
        name: 'Me',
        first_name: first,
        last_name: last,
        role: roleTagline,
        archetype: 'protagonist',
        importance_level: 'protagonist',
        summary: parsed.summary?.trim() || undefined,
        metadata: {
          ...existingMeta,
          is_self: true,
          is_user: true,
          real_name: fullName || existingMeta.real_name,
          resume_enriched_at: new Date().toISOString(),
          resume_file_id: context.sourceFileId,
          resume_file_name: context.fileName,
          social_media: social,
          ontology_tags: ontologyTags,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', characterId)
      .eq('user_id', userId);

    await characterBlurbService.refreshAndPersist(userId, characterId, { isSelf: true });

    return { characterId, attributes: attributeCount };
  }
}

export const resumeCharacterEnrichmentService = new ResumeCharacterEnrichmentService();
