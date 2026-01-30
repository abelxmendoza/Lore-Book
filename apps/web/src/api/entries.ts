import { config } from '../config/env';
import { fetchJson } from '../lib/api';
import { supabase } from '../lib/supabase';

export type Entry = {
  id: string;
  content: string;
  date: string;
  tags?: string[];
  chapterId?: string;
  mood?: string;
  summary?: string;
  metadata?: Record<string, unknown>;
};

export type VoiceMemoResponse = {
  entry: Entry;
  transcript: string;
  formatted: {
    content: string;
    summary?: string;
    tags?: string[];
    mood?: string;
  };
};

/**
 * Upload a voice memo file for transcription and entry creation
 */
export const uploadVoiceMemo = async (file: File): Promise<VoiceMemoResponse> => {
  // If mock data is enabled, return mock response
  if (config.dev.allowMockData) {
    if (config.dev.enableConsoleLogs) {
      console.warn('[MOCK API] Voice memo upload - Using mock data');
    }
    
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const mockResponse: VoiceMemoResponse = {
      entry: {
        id: `mock-entry-${Date.now()}`,
        content: 'This is a mock transcription of your voice memo. In production, this would be transcribed from your audio file.',
        date: new Date().toISOString(),
        tags: ['voice-memo', 'mock'],
        mood: 'neutral',
        summary: 'Mock voice memo transcription',
        metadata: { source: 'voice', mock: true }
      },
      transcript: 'This is a mock transcription of your voice memo.',
      formatted: {
        content: 'This is a mock transcription of your voice memo. In production, this would be transcribed from your audio file.',
        summary: 'Mock voice memo transcription',
        tags: ['voice-memo', 'mock'],
        mood: 'neutral'
      }
    };
    
    return Promise.resolve(mockResponse);
  }

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  
  const apiBaseUrl = config.api.url;
  const url = apiBaseUrl ? `${apiBaseUrl}/api/entries/voice` : '/api/entries/voice';
  const formData = new FormData();
  formData.append('audio', file);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: formData
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || error.message || 'Failed to upload voice memo');
  }
  
  return response.json();
};

/**
 * Get tag suggestions for entry content
 */
export const suggestTags = async (content: string): Promise<string[]> => {
  // If mock data is enabled, return mock suggestions
  if (config.dev.allowMockData) {
    if (config.dev.enableConsoleLogs) {
      console.warn('[MOCK API] Tag suggestions - Using mock data');
    }
    
    // Simple mock tag extraction based on content
    const mockTags: string[] = [];
    const contentLower = content.toLowerCase();
    
    if (contentLower.includes('work') || contentLower.includes('job') || contentLower.includes('career')) {
      mockTags.push('work');
    }
    if (contentLower.includes('family') || contentLower.includes('mom') || contentLower.includes('dad')) {
      mockTags.push('family');
    }
    if (contentLower.includes('friend') || contentLower.includes('social')) {
      mockTags.push('social');
    }
    if (contentLower.includes('travel') || contentLower.includes('trip') || contentLower.includes('vacation')) {
      mockTags.push('travel');
    }
    if (contentLower.includes('health') || contentLower.includes('exercise') || contentLower.includes('fitness')) {
      mockTags.push('health');
    }
    if (contentLower.includes('food') || contentLower.includes('eat') || contentLower.includes('restaurant')) {
      mockTags.push('food');
    }
    if (contentLower.includes('learn') || contentLower.includes('study') || contentLower.includes('education')) {
      mockTags.push('learning');
    }
    if (contentLower.includes('creative') || contentLower.includes('art') || contentLower.includes('music')) {
      mockTags.push('creative');
    }
    
    // Always add a few generic tags if we have content
    if (content.length > 20) {
      mockTags.push('memory', 'journal');
    }
    
    return Promise.resolve(mockTags.slice(0, 5)); // Limit to 5 tags
  }

  try {
    const response = await fetchJson<{ tags: string[] }>('/api/entries/suggest-tags', {
      method: 'POST',
      body: JSON.stringify({ content })
    });
    return response.tags;
  } catch (error) {
    // If API fails and mock data is not enabled, return empty array
    if (config.dev.enableConsoleLogs) {
      console.warn('Failed to fetch tag suggestions:', error);
    }
    return [];
  }
};

