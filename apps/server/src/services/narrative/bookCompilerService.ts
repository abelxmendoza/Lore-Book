/**
 * Book Compiler — produce BookOutline prep structures (not full generation yet).
 */
import type { BookOutline, BookOutlineChapter, NarrativeIR } from './types';

function chapterFromIR(ir: NarrativeIR, index: number): BookOutlineChapter {
  if (index === 0) {
    return {
      title: ir.currentChapter.title,
      summary: ir.currentChapter.summary,
      startDate: ir.currentChapter.startDate,
      endDate: ir.currentChapter.endDate,
      themes: [ir.currentChapter.dominantTheme],
    };
  }
  const arc = ir.dormantArcs[index - 1] ?? ir.activeArcs[index - 1];
  if (!arc) {
    return { title: `Chapter ${index + 1}`, summary: '', startDate: null, endDate: null, themes: [] };
  }
  return {
    title: arc.title,
    summary: `${arc.category} arc — ${arc.status}, momentum ${arc.momentum}`,
    startDate: arc.startDate,
    endDate: arc.latestActivity,
    themes: [arc.category],
  };
}

export function compileBookOutline(ir: NarrativeIR, kind: BookOutline['kind'] = 'autobiography'): BookOutline {
  const titleByKind: Record<BookOutline['kind'], string> = {
    autobiography: 'My Life Story',
    family_chronicle: 'Family Chronicle',
    relationship_story: 'Relationship Story',
    career_story: 'Career Story',
    year_in_review: `Year in Review — ${new Date().getFullYear()}`,
  };

  const chapterCount = Math.min(12, 1 + ir.activeArcs.length + ir.dormantArcs.length);
  const chapters: BookOutlineChapter[] = [];
  for (let i = 0; i < chapterCount; i++) {
    chapters.push(chapterFromIR(ir, i));
  }

  const characters = ir.relationships.map((r) => r.name).slice(0, 20);
  const themes = [...new Set([
    ir.currentChapter.dominantTheme,
    ...ir.activeArcs.map((a) => a.category),
    ...ir.scenes.map((s) => s.title),
  ])].slice(0, 10);

  return {
    title: titleByKind[kind],
    kind,
    chapters,
    timeline: ir.timeline.slice(0, 50),
    characters,
    locations: ir.scenes.flatMap((s) => s.cues).slice(0, 15),
    themes,
    generatedAt: new Date().toISOString(),
  };
}
