import fs from 'node:fs';
import path from 'node:path';

import { config } from '../../config';
import type { OpenAiSkillReference } from './openaiSkillsWorkflows';

export type OpenAiSkillsConfig = {
  enabled: boolean;
  agentModel: string;
  skillIds: {
    characterCardAudit?: string;
    rescanOps?: string;
  };
};

function loadManifestSkillIds(): Partial<OpenAiSkillsConfig['skillIds']> {
  try {
    const manifestPath = path.resolve(__dirname, '../../../../../openai-skills/manifest.json');
    if (!fs.existsSync(manifestPath)) return {};
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      skills?: Record<string, { id?: string }>;
    };
    return {
      characterCardAudit: manifest.skills?.['character-card-audit']?.id,
      rescanOps: manifest.skills?.['lorebook-rescan-ops']?.id,
    };
  } catch {
    return {};
  }
}

const manifestIds = loadManifestSkillIds();

export function getOpenAiSkillsConfig(): OpenAiSkillsConfig {
  return {
    enabled: config.openAiSkillsAgentEnabled,
    agentModel: config.openAiAgentModel,
    skillIds: {
      characterCardAudit:
        config.openAiSkillCharacterCardAuditId || manifestIds.characterCardAudit,
      rescanOps: config.openAiSkillRescanOpsId || manifestIds.rescanOps,
    },
  };
}

export function resolveSkillReferences(
  keys: Array<'characterCardAudit' | 'rescanOps'>,
): OpenAiSkillReference[] {
  const cfg = getOpenAiSkillsConfig();
  const refs: OpenAiSkillReference[] = [];

  for (const key of keys) {
    const skillId =
      key === 'characterCardAudit' ? cfg.skillIds.characterCardAudit : cfg.skillIds.rescanOps;
    if (skillId?.trim()) {
      refs.push({ type: 'skill_reference', skill_id: skillId.trim(), version: 'latest' });
    }
  }

  return refs;
}

export function assertSkillsAgentReady(skillKeys: Array<'characterCardAudit' | 'rescanOps'>): void {
  const cfg = getOpenAiSkillsConfig();
  if (!cfg.enabled) {
    throw new Error('OpenAI skills agent is disabled (set OPENAI_SKILLS_AGENT_ENABLED=true)');
  }
  if (!config.openAiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }
  const refs = resolveSkillReferences(skillKeys);
  if (refs.length !== skillKeys.length) {
    throw new Error(
      'Missing OpenAI skill IDs. Run npm run openai-skills:sync and set OPENAI_SKILL_* env vars.',
    );
  }
}
