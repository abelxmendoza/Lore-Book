import { EventEmitter } from 'node:events';

import { logger } from '../logger';
import { isSupabaseConfigured, supabaseAdmin } from '../services/supabaseClient';

type DeltaPayload = {
  type: string;
  timestamp: string;
  userId: string;
  payload: Record<string, unknown>;
};

const CHANNEL_NAME = 'orchestrator:deltas';
const localEmitter = new EventEmitter();

let channel: ReturnType<typeof supabaseAdmin.channel> | null = null;
let channelReady = false;

const ensureChannel = () => {
  if (!isSupabaseConfigured || typeof supabaseAdmin.channel !== 'function') {
    return;
  }

  if (!channel) {
    channel = supabaseAdmin.channel(CHANNEL_NAME, { config: { broadcast: { self: true } } });
    channel.subscribe((status) => {
      channelReady = status === 'SUBSCRIBED';
      if (status === 'SUBSCRIBED') {
        logger.info('Realtime orchestrator channel ready');
      }
    });
  }
};

export const emitDelta = async (
  type: string,
  payload: Record<string, unknown>,
  userId: string
): Promise<DeltaPayload> => {
  const delta: DeltaPayload = {
    type,
    payload,
    userId,
    timestamp: new Date().toISOString(),
  };

  if (isSupabaseConfigured && typeof supabaseAdmin.channel === 'function') {
    ensureChannel();
    try {
      if (!channelReady) {
        logger.debug({ type }, 'Queuing delta before realtime channel subscription');
      }
      await channel?.send({ type: 'broadcast', event: 'delta', payload: delta });
    } catch (error) {
      logger.warn({ error, delta }, 'Failed to emit realtime delta via Supabase');
      localEmitter.emit('delta', delta);
    }
  } else {
    localEmitter.emit('delta', delta);
  }

  return delta;
};

export const subscribeToLocalDeltas = (callback: (delta: DeltaPayload) => void) => {
  localEmitter.on('delta', callback);
  return () => {
    localEmitter.off('delta', callback);
  };
};
