import type { DocumentUploadResult } from '../features/chat/components/DocumentUpload';
import type { DemoUploadProgress, DemoUploadStage } from '../components/demo/DemoUploadProgressPanel';
import { shouldSimulateUploadFlow } from '../hooks/useShouldUseMockData';
import { demoEffectMessage, emitDemoEffect } from './demoMutationEffects';

export const DEMO_DOCUMENT_UPLOAD_STAGES: DemoUploadStage[] = [
  { label: 'Reading document…', durationMs: 700 },
  { label: 'Extracting text & structure…', durationMs: 950 },
  { label: 'Detecting people & places…', durationMs: 850 },
  { label: 'Saving to your library…', durationMs: 650 },
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

function buildDemoDocumentMessage(fileName: string): string {
  const baseName = fileName.replace(/\.(pdf|docx?|txt|md)$/i, '').replace(/[_-]/g, ' ');
  return [
    `**Document ingested** — *${fileName}*`,
    '',
    'I extracted narrative content and linked it to your lore.',
    '',
    '**Added to lore**',
    '• 3 journal entries',
    '• 2 characters mentioned',
    '• 1 memoir section draft',
    '',
    baseName.length > 2
      ? `Open your timeline to review entries from **${baseName}**.`
      : 'Open your timeline to review the new entries.',
  ].join('\n');
}

export function shouldSimulateDocumentUpload(): boolean {
  return shouldSimulateUploadFlow();
}

export async function simulateDemoDocumentUpload(
  file: File,
  onProgress: (progress: DemoUploadProgress) => void,
): Promise<DocumentUploadResult> {
  await runStagedProgress(DEMO_DOCUMENT_UPLOAD_STAGES, onProgress);

  const result: DocumentUploadResult = {
    kind: 'document',
    fileName: file.name,
    message: buildDemoDocumentMessage(file.name),
    entriesCreated: 3,
  };

  const msg = demoEffectMessage('document_uploaded', file.name);
  emitDemoEffect({
    kind: 'document_uploaded',
    ...msg,
    showToast: true,
  });

  window.dispatchEvent(new Event('lk:story-data-updated'));

  return result;
}
