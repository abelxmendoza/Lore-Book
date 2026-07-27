/**
 * Explicit Projects book writes from chat — create / rename / delete.
 */

import { normalizeNameKey } from '../../utils/nameNormalization';
import { projectService } from '../projectService';
import { projectSuggestionService } from '../projects/projectSuggestionService';

export type ProjectWriteResult = {
  summary: string;
  operation: 'create' | 'rename' | 'delete';
  projectId: string | null;
  projectName: string;
};

function cleanName(raw: string): string {
  return raw
    .replace(/^(?:the|a|an|my)\s+/i, '')
    .replace(/[.!?,"]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function findProjectByName(userId: string, name: string) {
  const key = normalizeNameKey(name);
  const projects = await projectService.listProjects(userId);
  return (
    projects.find(
      (p) =>
        normalizeNameKey(p.name) === key || normalizeNameKey(p.normalized_name ?? '') === key,
    ) ?? null
  );
}

export async function writeProjectFromChat(
  userId: string,
  message: string,
): Promise<ProjectWriteResult> {
  const text = message.trim();

  const rename = text.match(/\b(?:rename)\s+(?:the\s+)?project\s+(.{1,60}?)\s+to\s+(.{1,60})$/i);
  if (rename) {
    const from = cleanName(rename[1]);
    const to = cleanName(rename[2]);
    const existing = await findProjectByName(userId, from);
    if (!existing) throw new Error(`I couldn't find a project named "${from}".`);
    await projectService.updateProject(userId, existing.id, { name: to });
    return {
      summary: `Renamed the project **${existing.name}** to **${to}**.`,
      operation: 'rename',
      projectId: existing.id,
      projectName: to,
    };
  }

  const del = text.match(
    /\b(?:delete|remove)\s+(?:the\s+)?project\s+(.{1,80})$|\b(?:delete|remove)\s+(.{1,80}?)\s+from\s+(?:my\s+)?projects?(?:\s+book)?\b/i,
  );
  if (del) {
    const name = cleanName(del[1] || del[2] || '');
    const existing = await findProjectByName(userId, name);
    if (!existing) throw new Error(`I couldn't find a project named "${name}".`);
    await projectService.deleteProject(userId, existing.id);
    return {
      summary: `Deleted **${existing.name}** from Projects.`,
      operation: 'delete',
      projectId: existing.id,
      projectName: existing.name,
    };
  }

  const create = text.match(
    /\b(?:add|save|put|create)\s+(.{1,80}?)\s+(?:as|to|into)\s+(?:a\s+|an\s+|my\s+)?project(?:\s+book)?\b/i,
  );
  if (create) {
    const name = cleanName(create[1]);
    const existing = await findProjectByName(userId, name);
    if (existing) {
      return {
        summary: `**${existing.name}** is already in Projects.`,
        operation: 'create',
        projectId: existing.id,
        projectName: existing.name,
      };
    }
    const project = await projectSuggestionService.materializeProject(userId, { name });
    return {
      summary: `Added **${project?.name ?? name}** to Projects.`,
      operation: 'create',
      projectId: project?.id ?? null,
      projectName: project?.name ?? name,
    };
  }

  throw new Error('Try “add MemoVault as a project”, “rename the project X to Y”, or “delete the project X”.');
}
