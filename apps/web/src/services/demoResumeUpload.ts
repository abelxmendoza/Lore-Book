import type { ResumeUploadResult } from '../features/chat/components/DocumentUpload';
import { shouldSimulateUploadFlow } from '../hooks/useShouldUseMockData';
import { demoEffectMessage, emitDemoEffect } from './demoMutationEffects';

export type ResumeUploadStage = {
  label: string;
  durationMs: number;
};

export const DEMO_RESUME_UPLOAD_STAGES: ResumeUploadStage[] = [
  { label: 'Reading your resume…', durationMs: 750 },
  { label: 'Extracting roles and skills…', durationMs: 1100 },
  { label: 'Building career timeline…', durationMs: 950 },
  { label: 'Enriching your profile…', durationMs: 850 },
  { label: 'Saving to your lore library…', durationMs: 650 },
];

export type DemoResumeUploadProgress = {
  stageIndex: number;
  stageLabel: string;
  percent: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildDemoChatFeedback(fileName: string): string {
  const baseName = fileName.replace(/\.(pdf|docx?|txt)$/i, '').replace(/[_-]/g, ' ');
  return [
    `**Resume ingested** — *${fileName}*`,
    '',
    'I pulled structured career history from your upload and saved it to the **Documents library**.',
    '',
    '**Career timeline**',
    '• Senior Product Engineer — Northwind Labs (Jan 2022 – Present)',
    '• Software Engineer — Contoso Systems (Jun 2019 – Dec 2021)',
    '',
    '**Education timeline**',
    '• B.S. Computer Science — State University (2015 – 2019)',
    '',
    '**Added to lore**',
    '• 14 profile claims for review',
    '• 6 timeline events',
    '• 8 skills (TypeScript, React, system design, …)',
    '• 2 organizations linked to your story',
    '',
    baseName.length > 2
      ? `Your protagonist profile now reflects experience from **${baseName}**. Open Discovery → Career to confirm claims.`
      : 'Open Discovery → Career to review and confirm extracted claims.',
  ].join('\n');
}

export function shouldSimulateResumeUpload(): boolean {
  return shouldSimulateUploadFlow();
}

export async function simulateDemoResumeUpload(
  file: File,
  onProgress: (progress: DemoResumeUploadProgress) => void,
): Promise<ResumeUploadResult> {
  const stages = DEMO_RESUME_UPLOAD_STAGES;
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

  const result: ResumeUploadResult = {
    kind: 'resume',
    fileName: file.name,
    chatFeedback: buildDemoChatFeedback(file.name),
    userFileId: `demo-resume-${Date.now()}`,
    claimsCreated: 14,
    momentsCreated: 8,
    eventsCreated: 6,
  };

  const msg = demoEffectMessage('resume_uploaded', file.name);
  emitDemoEffect({
    kind: 'resume_uploaded',
    ...msg,
    showToast: true,
  });

  window.dispatchEvent(new Event('lk:characters-updated'));

  return result;
}
