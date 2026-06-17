import { fetchJson } from '../lib/api';

export type SectionSavePayload = {
  sectionId: string;
  title?: string;
  content?: string;
  biographyId?: string;
};

export async function saveBiographySection(payload: SectionSavePayload): Promise<void> {
  await fetchJson('/api/biography/section', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export type SectionChatPayload = {
  sectionId: string;
  focus?: string;
  message: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  biographyId?: string;
};

export type SectionChatResult = {
  answer: string;
  updatedContent?: string;
  driftWarning?: string;
};

export async function chatEditBiographySection(payload: SectionChatPayload): Promise<SectionChatResult> {
  return fetchJson<SectionChatResult>('/api/biography/section/chat', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
