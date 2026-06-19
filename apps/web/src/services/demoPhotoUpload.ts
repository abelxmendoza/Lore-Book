import type { DemoUploadProgress, DemoUploadStage } from '../components/demo/DemoUploadProgressPanel';
import { shouldSimulateUploadFlow } from '../hooks/useShouldUseMockData';
import { demoEffectMessage, emitDemoEffect } from './demoMutationEffects';

export type DemoPhotoAnalysis = {
  photoType: 'memory' | 'document' | 'junk';
  confidence: number;
  extractedText?: string;
  suggestedLocation?: {
    type: 'timeline' | 'character' | 'location' | 'memoir' | 'entry';
    id?: string;
    name: string;
    reason: string;
  };
  detectedEntities?: {
    characters?: string[];
    locations?: string[];
    dates?: string[];
  };
  summary?: string;
  metadata?: {
    date?: string;
    location?: string;
    people?: string[];
  };
};

export type DemoPhotoProcessResult = {
  message: string;
  entryId: string;
};

export const DEMO_PHOTO_ANALYZE_STAGES: DemoUploadStage[] = [
  { label: 'Reading image…', durationMs: 650 },
  { label: 'Detecting people & places…', durationMs: 900 },
  { label: 'Suggesting lore placement…', durationMs: 750 },
];

export const DEMO_PHOTO_PROCESS_STAGES: DemoUploadStage[] = [
  { label: 'Saving photo…', durationMs: 600 },
  { label: 'Linking to your timeline…', durationMs: 850 },
  { label: 'Updating lore book…', durationMs: 700 },
];

export const DEMO_PHOTO_GALLERY_STAGES: DemoUploadStage[] = [
  { label: 'Reading image…', durationMs: 550 },
  { label: 'Extracting metadata…', durationMs: 800 },
  { label: 'Writing journal entry…', durationMs: 750 },
  { label: 'Adding to gallery…', durationMs: 600 },
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runStagedProgress(
  stages: DemoUploadStage[],
  onProgress: (progress: DemoUploadProgress) => void,
): Promise<void> {
  const totalMs = stages.reduce((sum, stage) => sum + stage.durationMs, 0);
  let elapsed = 0;

  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];
    onProgress({
      stageIndex: i,
      stageLabel: stage.label,
      percent: Math.min(99, Math.round((elapsed / totalMs) * 100)),
    });
    await sleep(stage.durationMs);
    elapsed += stage.durationMs;
    onProgress({
      stageIndex: i,
      stageLabel: stage.label,
      percent: Math.min(99, Math.round((elapsed / totalMs) * 100)),
    });
  }

  onProgress({
    stageIndex: stages.length - 1,
    stageLabel: 'Complete',
    percent: 100,
  });
}

function inferPhotoType(fileName: string): DemoPhotoAnalysis['photoType'] {
  const lower = fileName.toLowerCase();
  if (
    lower.includes('screenshot') ||
    lower.includes('receipt') ||
    lower.includes('scan') ||
    lower.includes('document') ||
    lower.includes('note')
  ) {
    return 'document';
  }
  if (lower.includes('thumb') || lower.includes('blur') || lower.includes('tmp')) {
    return 'junk';
  }
  return 'memory';
}

export function buildDemoPhotoAnalysis(file: File): DemoPhotoAnalysis {
  const photoType = inferPhotoType(file.name);
  const baseName = file.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ');

  if (photoType === 'document') {
    return {
      photoType,
      confidence: 0.88,
      extractedText: `Notes captured from "${file.name}".\n\n• Meeting recap with Sarah Chen\n• Follow up on mountain trail photos\n• Add to Summer 2024 timeline`,
      summary: 'Document photo with readable text — good candidate for text extraction.',
      suggestedLocation: {
        type: 'entry',
        name: 'Journal entries',
        reason: 'Extracted text fits your ongoing journal thread.',
      },
      detectedEntities: {
        dates: ['Summer 2024'],
      },
    };
  }

  if (photoType === 'junk') {
    return {
      photoType,
      confidence: 0.42,
      summary: 'Low-signal image — may be a screenshot or duplicate.',
    };
  }

  return {
    photoType,
    confidence: 0.91,
    summary: `A meaningful memory photo${baseName.length > 2 ? `: ${baseName}` : ''}.`,
    suggestedLocation: {
      type: 'timeline',
      name: 'Summer 2024 · Mountain View Trail',
      reason: 'Matches recent hikes and people already in your lore.',
    },
    detectedEntities: {
      characters: ['Sarah Chen'],
      locations: ['Mountain View Trail'],
      dates: ['June 2024'],
    },
    metadata: {
      date: 'June 15, 2024',
      location: 'Mountain View Trail',
      people: ['Sarah Chen'],
    },
  };
}

export function shouldSimulatePhotoUpload(): boolean {
  return shouldSimulateUploadFlow();
}

export async function simulateDemoPhotoAnalyze(
  file: File,
  onProgress: (progress: DemoUploadProgress) => void,
): Promise<DemoPhotoAnalysis> {
  await runStagedProgress(DEMO_PHOTO_ANALYZE_STAGES, onProgress);
  return buildDemoPhotoAnalysis(file);
}

export async function simulateDemoPhotoProcess(
  file: File,
  options: { addToLoreBook: boolean; extractTextOnly: boolean },
  onProgress: (progress: DemoUploadProgress) => void,
): Promise<DemoPhotoProcessResult> {
  await runStagedProgress(DEMO_PHOTO_PROCESS_STAGES, onProgress);

  const message = options.extractTextOnly
    ? 'Text extracted successfully'
    : options.addToLoreBook
      ? 'Photo added to lore book'
      : 'Photo processed';

  const msg = demoEffectMessage('photo_uploaded', file.name);
  emitDemoEffect({
    kind: 'photo_uploaded',
    ...msg,
    showToast: true,
  });

  window.dispatchEvent(new Event('lk:story-data-updated'));

  return {
    message,
    entryId: `demo-photo-${Date.now()}`,
  };
}

export async function simulateDemoPhotoGalleryUpload(
  file: File,
  onProgress: (progress: DemoUploadProgress) => void,
): Promise<{
  photoId: string;
  url: string;
  locationName: string;
  content: string;
  tags: string[];
}> {
  await runStagedProgress(DEMO_PHOTO_GALLERY_STAGES, onProgress);

  const analysis = buildDemoPhotoAnalysis(file);
  const locationName =
    analysis.metadata?.location ??
    analysis.detectedEntities?.locations?.[0] ??
    'Mountain View Trail';

  const msg = demoEffectMessage('photo_uploaded', file.name);
  emitDemoEffect({
    kind: 'photo_uploaded',
    ...msg,
    showToast: true,
  });

  return {
    photoId: `demo-photo-${Date.now()}`,
    url: URL.createObjectURL(file),
    locationName,
    content:
      analysis.summary ??
      `Auto-generated entry from photo: ${file.name}. Linked to your ongoing story.`,
    tags: ['photo', 'demo', ...(analysis.detectedEntities?.characters?.map((c) => c.toLowerCase()) ?? [])],
  };
}
