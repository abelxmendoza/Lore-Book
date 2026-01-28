import { useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { config } from '../config/env';
import type { CurrentContext } from '../types/currentContext';

type StreamChunk = {
  type: 'metadata' | 'chunk' | 'done' | 'error';
  content?: string;
  data?: any;
  error?: string;
};

export const useChatStream = () => {
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const streamChat = useCallback(async (
    message: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
    onChunk: (content: string) => void,
    onMetadata: (metadata: any) => void,
    onComplete: () => void,
    onError: (error: string) => void,
    entityContext?: { type: 'CHARACTER' | 'LOCATION' | 'PERCEPTION' | 'MEMORY' | 'ENTITY' | 'GOSSIP'; id: string },
    currentContext?: CurrentContext
  ) => {
    setIsStreaming(true);
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;

      // Use the configured API URL
      const apiUrl = config.api.url || 'http://localhost:4000';
      const url = `${apiUrl}/api/chat/stream`;

      console.log('[useChatStream] Calling:', url);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        credentials: 'include',
        mode: 'cors', // Explicitly set CORS mode
        body: JSON.stringify({
          message,
          conversationHistory,
          ...(entityContext ? { entityContext } : {}),
          ...(currentContext && currentContext.kind !== 'none' ? { currentContext } : {})
        }),
        signal: abortController.signal
      }).catch((fetchError) => {
        console.error('[useChatStream] Fetch error:', {
          error: fetchError,
          message: fetchError.message,
          name: fetchError.name,
          url,
          apiUrl,
          timestamp: new Date().toISOString(),
        });
        
        // Provide more helpful error message
        const errorMessage = fetchError.message.includes('Failed to fetch') || 
                            fetchError.message.includes('NetworkError') ||
                            fetchError.message.includes('ERR_CONNECTION_REFUSED')
          ? `Backend server is not running. Start it with: cd apps/server && npm run dev`
          : `Network error: ${fetchError.message}. Make sure the backend server is running on ${apiUrl}`;
        
        throw new Error(errorMessage);
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error('[useChatStream] HTTP error:', response.status, errorText);
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        if (abortController.signal.aborted) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;

          try {
            const data: StreamChunk = JSON.parse(line.slice(6));

            if (data.type === 'metadata') {
              onMetadata(data.data);
            } else if (data.type === 'chunk' && data.content) {
              onChunk(data.content);
            } else if (data.type === 'done') {
              onComplete();
              setIsStreaming(false);
              return;
            } else if (data.type === 'error') {
              throw new Error(data.error || 'Stream error');
            }
          } catch (parseError) {
            console.error('Failed to parse SSE data:', parseError);
          }
        }
      }

      setIsStreaming(false);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        setIsStreaming(false);
        return;
      }
      setIsStreaming(false);
      onError(error instanceof Error ? error.message : 'Unknown error');
    }
  }, []);

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsStreaming(false);
    }
  }, []);

  return { streamChat, isStreaming, cancel };
};

