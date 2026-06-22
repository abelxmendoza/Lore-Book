import { config } from '../../config';
import { openai } from '../../lib/openai';
import { logger } from '../../logger';
import { extractResponseText } from '../../lib/openaiResponsesBridge';
import { loadOpenAiSessionState, mergeOpenAiSessionState } from './openaiSessionState';

export type BackgroundResponseJob = {
  responseId: string;
  status: 'queued' | 'in_progress' | 'completed' | 'failed';
  outputText?: string;
  error?: string;
};

export async function createBackgroundResponse(params: {
  userId: string;
  sessionId: string;
  model: string;
  instructions?: string;
  input: string;
}): Promise<BackgroundResponseJob> {
  if (!config.openAiBackgroundResponses) {
    throw new Error('OpenAI background responses are disabled (OPENAI_BACKGROUND_RESPONSES)');
  }

  const response = await openai.responses.create({
    model: params.model,
    instructions: params.instructions,
    input: params.input,
    background: true,
    store: true,
    safety_identifier: params.userId,
  });

  const responseId = response.id;
  const status = normalizeStatus(response.status);

  await mergeOpenAiSessionState(params.userId, params.sessionId, {
    background_jobs: [
      ...(await loadOpenAiSessionState(params.userId, params.sessionId)).background_jobs ?? [],
      {
        response_id: responseId,
        status,
        created_at: new Date().toISOString(),
      },
    ],
  });

  return { responseId, status };
}

export async function retrieveBackgroundResponse(responseId: string): Promise<BackgroundResponseJob> {
  const response = await openai.responses.retrieve(responseId);
  const status = normalizeStatus(response.status);
  return {
    responseId,
    status,
    outputText: status === 'completed' ? extractResponseText(response) : undefined,
    error: response.error?.message,
  };
}

export async function handleBackgroundResponseWebhook(event: {
  type?: string;
  data?: { id?: string; status?: string; error?: { message?: string } };
}): Promise<void> {
  if (!event?.type?.startsWith('response.')) return;

  const responseId = event.data?.id;
  if (!responseId) return;

  logger.info(
    { type: event.type, responseId, status: event.data?.status },
    'OpenAI background response webhook',
  );

  // Jobs are keyed by response_id in session metadata; webhook handlers update
  // status when the dashboard is configured to POST here.
  const status = normalizeStatus(event.data?.status);
  const patchStatus = status === 'queued' ? 'in_progress' : status;

  // We do not know user/session from the webhook alone — callers that enqueue
  // background jobs should poll retrieveBackgroundResponse by id. This handler
  // is primarily for observability + future session correlation.
  if (patchStatus === 'failed') {
    logger.warn({ responseId, error: event.data?.error?.message }, 'Background response failed');
  }
}

function normalizeStatus(
  status: string | undefined | null,
): BackgroundResponseJob['status'] {
  if (status === 'completed') return 'completed';
  if (status === 'failed' || status === 'cancelled' || status === 'canceled') return 'failed';
  if (status === 'in_progress' || status === 'incomplete') return 'in_progress';
  return 'queued';
}
