import { config } from '../../config';
import { logger } from '../../logger';
import { characterCardAuditService } from '../characters/audit/characterCardAuditService';
import { characterCardRescanAuditService } from '../characters/audit/characterCardRescanAuditService';
import { characterRescanStateService } from '../characters/audit/characterRescanStateService';
import { assertSkillsAgentReady, getOpenAiSkillsConfig, resolveSkillReferences } from './openaiSkillsConfig';
import {
  WORKFLOW_LABELS,
  WORKFLOW_SKILL_KEYS,
  type OpenAiSkillsWorkflow,
} from './openaiSkillsWorkflows';

export type SkillsAgentRunRequest = {
  workflow: OpenAiSkillsWorkflow;
  input: string;
  targetUserId: string;
  /** Admin user id for logging */
  requestedByUserId: string;
};

export type SkillsAgentRunResult = {
  workflow: OpenAiSkillsWorkflow;
  outputText: string;
  responseId?: string;
  contextIncluded: string[];
  rawOutput?: unknown[];
};

type OpenAiResponsesPayload = {
  id?: string;
  output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }>; text?: string }>;
  output_text?: string;
};

async function loadWorkflowContext(
  workflow: OpenAiSkillsWorkflow,
  targetUserId: string,
): Promise<{ contextBlock: string; included: string[] }> {
  const included: string[] = [];
  const blocks: string[] = [];

  if (workflow === 'character_card_audit' || workflow === 'lorebook_ops') {
    const audit = await characterCardAuditService.audit(targetUserId);
    included.push('character_card_audit_report');
    blocks.push(`## Live character card audit (JSON)\n\`\`\`json\n${JSON.stringify(audit, null, 2)}\n\`\`\``);
  }

  if (workflow === 'rescan_ops' || workflow === 'lorebook_ops') {
    const [rescanState, reviewQueue] = await Promise.all([
      characterRescanStateService.load(targetUserId),
      characterCardRescanAuditService.getPendingReviewSuggestions(targetUserId),
    ]);
    included.push('rescan_state', 'card_review_queue');
    blocks.push(
      `## Rescan state (read-only)\n\`\`\`json\n${JSON.stringify(rescanState, null, 2)}\n\`\`\``,
      `## Pending card review queue\n\`\`\`json\n${JSON.stringify(reviewQueue, null, 2)}\n\`\`\``,
    );
  }

  return { contextBlock: blocks.join('\n\n'), included };
}

function extractOutputText(body: OpenAiResponsesPayload): string {
  if (body.output_text?.trim()) return body.output_text.trim();

  const parts: string[] = [];
  for (const item of body.output ?? []) {
    if (item.type === 'message') {
      for (const block of item.content ?? []) {
        if (block.type === 'output_text' && block.text) parts.push(block.text);
      }
    }
    if (typeof item.text === 'string') parts.push(item.text);
  }
  return parts.join('\n').trim() || '(No text output from agent)';
}

class OpenAiSkillsAgentService {
  async run(request: SkillsAgentRunRequest): Promise<SkillsAgentRunResult> {
    const skillKeys = WORKFLOW_SKILL_KEYS[request.workflow];
    assertSkillsAgentReady(skillKeys);

    const skillsCfg = getOpenAiSkillsConfig();
    const skillRefs = resolveSkillReferences(skillKeys);
    const { contextBlock, included } = await loadWorkflowContext(request.workflow, request.targetUserId);

    const prompt = [
      `# ${WORKFLOW_LABELS[request.workflow]}`,
      '',
      'Use the mounted LoreBook skills. Follow their audit/rescan rules exactly.',
      'Do not invent character data — only analyze the JSON context below.',
      '',
      request.input.trim(),
      '',
      contextBlock,
    ]
      .filter(Boolean)
      .join('\n');

    logger.info(
      {
        workflow: request.workflow,
        requestedBy: request.requestedByUserId,
        targetUserId: request.targetUserId,
        skillCount: skillRefs.length,
        model: skillsCfg.agentModel,
      },
      'OpenAI skills agent run started',
    );

    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.openAiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: skillsCfg.agentModel,
        tools: [
          {
            type: 'shell',
            environment: {
              type: 'container_auto',
              skills: skillRefs,
            },
          },
        ],
        input: prompt,
        store: false,
        safety_identifier: request.requestedByUserId,
      }),
    });

    const body = (await res.json()) as OpenAiResponsesPayload & { error?: { message?: string } };
    if (!res.ok) {
      const message = body.error?.message ?? `OpenAI Responses API error (${res.status})`;
      logger.error({ status: res.status, body }, 'OpenAI skills agent failed');
      throw new Error(message);
    }

    const outputText = extractOutputText(body);

    logger.info(
      {
        workflow: request.workflow,
        responseId: body.id,
        outputLength: outputText.length,
      },
      'OpenAI skills agent run completed',
    );

    return {
      workflow: request.workflow,
      outputText,
      responseId: body.id,
      contextIncluded: included,
      rawOutput: body.output,
    };
  }

  listWorkflows(): Array<{ id: OpenAiSkillsWorkflow; label: string; skillsReady: boolean }> {
    const cfg = getOpenAiSkillsConfig();
    return (Object.keys(WORKFLOW_SKILL_KEYS) as OpenAiSkillsWorkflow[]).map((id) => {
      const keys = WORKFLOW_SKILL_KEYS[id];
      const refs = resolveSkillReferences(keys);
      return {
        id,
        label: WORKFLOW_LABELS[id],
        skillsReady: cfg.enabled && refs.length === keys.length,
      };
    });
  }
}

export const openAiSkillsAgentService = new OpenAiSkillsAgentService();
