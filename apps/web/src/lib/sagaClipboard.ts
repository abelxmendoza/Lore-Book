import type { SagaOverview } from '../api/saga';

import { buildListClipboardText } from './listClipboard';

export function buildLifeSagaClipboardText(saga: SagaOverview | null | undefined): string {
  if (!saga) {
    return buildListClipboardText({ title: 'Life Saga', items: [] });
  }

  const storylineItems = saga.currentStorylines.map((storyline) => ({
    heading: storyline.label,
    fields: [
      { label: 'Id', value: storyline.id },
      { label: 'Intensity', value: `${storyline.intensity}%` },
    ],
  }));

  const chapterItems = saga.eras.flatMap((era) =>
    era.chapters.flatMap((chapter) =>
      chapter.storylines.map((storyline) => ({
        heading: `${chapter.title} — ${storyline.title}`,
        fields: [
          { label: 'Id', value: storyline.id },
          { label: 'Era', value: era.title },
          { label: 'Status', value: storyline.status },
          { label: 'Turning point', value: storyline.status === 'completed' || storyline.status === 'resurfaced' },
        ],
        body: storyline.summary?.trim() || undefined,
      })),
    ),
  );

  const storylinesBlock = buildListClipboardText({
    title: 'Current storylines',
    items: storylineItems,
  });
  const chaptersBlock = buildListClipboardText({
    title: 'Chapters',
    items: chapterItems,
  });

  return [
    `Life Saga`,
    `Era: ${saga.era}`,
    '',
    storylinesBlock,
    '',
    chaptersBlock,
  ].join('\n');
}
