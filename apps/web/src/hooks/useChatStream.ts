import { useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

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
    entityContext?: { type: 'CHARACTER' | 'LOCATION' | 'PERCEPTION' | 'MEMORY' | 'ENTITY' | 'GOSSIP'; id: string }
  ) => {
    setIsStreaming(true);
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;

      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        credentials: 'include',
        body: JSON.stringify({
          message,
          conversationHistory,
          ...(entityContext ? { entityContext } : {})
        }),
        signal: abortController.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
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

