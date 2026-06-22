import { normalizeNameKey } from '../../../utils/nameNormalization';
import type { SkillCandidate } from './skillInferenceTypes';
import { buildSkillContext } from './skillProvenanceService';

const TOOL_CONTEXT_RE =
  /\b(?:using|with|built with|deployed with)\s+(OpenCV|Docker|Kubernetes|React|ROS2|Python)\b/gi;

export function inferToolSkills(text: string): SkillCandidate[] {
  const out: SkillCandidate[] = [];
  const seen = new Set<string>();

  let match: RegExpExecArray | null;
  const re = new RegExp(TOOL_CONTEXT_RE.source, 'gi');
  while ((match = re.exec(text)) !== null) {
    const tool = match[1].trim();
    const key = normalizeNameKey(tool);
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      displayName: tool === 'ROS2' ? 'ROS2' : tool,
      skillType: classifyTool(tool),
      context: buildSkillContext(text, tool, {
        tool,
        activity: match[0],
      }),
      evidencePhrases: [match[0]],
      sourceMessageIds: [],
      confidence: 0.84,
      inferredNotConfirmed: true,
      requiresReview: false,
      promotionStatus: 'candidate',
    });
  }

  return out;
}

function classifyTool(tool: string): SkillCandidate['skillType'] {
  if (/^ros2?$/i.test(tool)) return 'robotics';
  if (/^(python|c\+\+|typescript|javascript)$/i.test(tool)) return 'programming_language';
  return 'software_tool';
}
