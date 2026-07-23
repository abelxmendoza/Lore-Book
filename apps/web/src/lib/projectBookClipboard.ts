import type { ProjectCardData } from '../components/projects/ProjectProfileCard';

import { buildListClipboardText } from './listClipboard';

export function buildProjectBookClipboardText(projects: ProjectCardData[]): string {
  return buildListClipboardText({
    title: 'Projects Book',
    items: projects.map((project) => ({
      heading: project.name,
      fields: [
        { label: 'Id', value: project.id },
        { label: 'Type', value: project.type },
        { label: 'Status', value: project.status },
        { label: 'Tags', value: project.tags },
        { label: 'Started', value: project.started_at },
        { label: 'Ended', value: project.ended_at },
        { label: 'Importance', value: project.importance_score },
        { label: 'Updated', value: project.updated_at },
        { label: 'Source', value: project.metadata?.source },
        { label: 'Summary', value: project.summary },
      ],
      body: project.description?.trim() || undefined,
    })),
  });
}
