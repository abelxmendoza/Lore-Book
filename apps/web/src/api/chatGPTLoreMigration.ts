import { API_URL } from '../config/env';
import { fetchJson } from '../lib/api';
import { acquireCsrfToken, addCsrfHeaders } from '../lib/security';
import { supabase } from '../lib/supabase';

export type ChatGPTConversationSummary = {
  id: string;
  title: string;
  createdAt: string | null;
  updatedAt: string | null;
  messageCount: number;
  userMessageCount: number;
  assistantMessageCount: number;
  preview: string;
};

export type ChatGPTExportInventory = {
  conversations: ChatGPTConversationSummary[];
  conversationCount: number;
  messageCount: number;
  userMessageCount: number;
  assistantMessageCount: number;
  earliestAt: string | null;
  latestAt: string | null;
  sourceFiles: string[];
};

export type ChatGPTLoreMigrationStats = {
  conversationsProcessed: number;
  userMessagesConsidered: number;
  assistantMessagesExcluded: number;
  hypotheticalMessagesExcluded: number;
  sensitiveClaimsExcluded: number;
  proposalsCreated: number;
  proposalsDeduplicated: number;
  categoryCounts: Record<string, number>;
  examples: Record<string, string[]>;
};

export type ChatGPTLoreProgress = {
  success: true;
  sourceFileId: string;
  completed: boolean;
  cursor: number;
  total: number;
  progress: number;
  stats: ChatGPTLoreMigrationStats;
  profilePreview: {
    categoryCounts: Record<string, number>;
    examples: Record<string, string[]>;
  };
};

async function authToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sign in to import your private ChatGPT archive.');
  return token;
}

export async function analyzeChatGPTExport(file: File): Promise<{
  success: true;
  sourceFileId: string;
  reused: boolean;
  inventory: ChatGPTExportInventory;
}> {
  const token = await authToken();
  await acquireCsrfToken(token, API_URL);
  const body = new FormData();
  body.append('file', file);
  const response = await fetch(`${API_URL}/api/documents/chatgpt-export/analyze`, {
    method: 'POST',
    headers: addCsrfHeaders({ Authorization: `Bearer ${token}` }),
    body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || payload.error || 'Could not analyze this ChatGPT export.');
  return payload;
}

export async function processChatGPTExport(
  sourceFileId: string,
  options: {
    conversationIds?: string[];
    dateFrom?: string;
    dateTo?: string;
    titleQuery?: string;
    includeSensitive?: boolean;
    batchSize?: number;
  },
): Promise<ChatGPTLoreProgress> {
  return fetchJson(`/api/documents/chatgpt-export/${sourceFileId}/process`, {
    method: 'POST',
    body: JSON.stringify(options),
  }, { timeoutMs: 120_000 });
}

export async function deleteChatGPTExportSource(sourceFileId: string): Promise<void> {
  await fetchJson(`/api/documents/chatgpt-export/${sourceFileId}/source`, {
    method: 'DELETE',
  });
}
