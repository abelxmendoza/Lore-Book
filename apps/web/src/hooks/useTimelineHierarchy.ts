/**
 * Timeline Hierarchy Hook
 * Provides API access to timeline hierarchy operations
 */

import { useState, useEffect, useCallback } from 'react';
import { fetchJson } from '../lib/api';
import {
  TimelineNode,
  TimelineLayer,
  CreateTimelineNodePayload,
  UpdateTimelineNodePayload,
  TimelineSearchFilters,
  AutoClassificationResult,
  TimelineRecommendation
} from '../types/timeline';

export const useTimelineHierarchy = () => {
  const [mythos, setMythos] = useState<TimelineNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [recommendations, setRecommendations] = useState<TimelineRecommendation[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchJson<{ results: TimelineNode[] }>('/api/timeline-hierarchy/search', {
        method: 'POST',
        body: JSON.stringify({ layer_type: ['mythos'] })
      });
      setMythos(response.results || []);
    } catch (error) {
      console.error('Failed to load mythos:', error);
      setMythos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    loadRecommendations();
  }, [refresh]);

  const loadRecommendations = async () => {
    try {
      const response = await fetchJson<{ recommendations: TimelineRecommendation[] }>(
        '/api/timeline-hierarchy/recommendations'
      );
      setRecommendations(response.recommendations || []);
    } catch (error) {
      console.error('Failed to load recommendations:', error);
    }
  };

  const createNode = async (
    layer: TimelineLayer,
    payload: CreateTimelineNodePayload
  ): Promise<TimelineNode> => {
    const response = await fetchJson<{ node: TimelineNode }>(
      `/api/timeline-hierarchy/${layer}/create`,
      {
        method: 'POST',
        body: JSON.stringify(payload)
      }
    );
    return response.node;
  };

  const updateNode = async (
    layer: TimelineLayer,
    nodeId: string,
    payload: UpdateTimelineNodePayload
  ): Promise<TimelineNode> => {
    const response = await fetchJson<{ node: TimelineNode }>(
      `/api/timeline-hierarchy/${layer}/update/${nodeId}`,
      {
        method: 'POST',
        body: JSON.stringify(payload)
      }
    );
    return response.node;
  };

  const getNode = async (
    layer: TimelineLayer,
    nodeId: string
  ): Promise<TimelineNode> => {
    const response = await fetchJson<{ node: TimelineNode }>(
      `/api/timeline-hierarchy/${layer}/${nodeId}`
    );
    return response.node;
  };

  const getChildren = async (
    layer: TimelineLayer,
    parentId: string
  ): Promise<TimelineNode[]> => {
    const response = await fetchJson<{ children: TimelineNode[] }>(
      `/api/timeline-hierarchy/${layer}/${parentId}/children`
    );
    return response.children || [];
  };

  const deleteNode = async (
    layer: TimelineLayer,
    nodeId: string
  ): Promise<void> => {
    await fetchJson(`/api/timeline-hierarchy/${layer}/${nodeId}`, {
      method: 'DELETE'
    });
  };

  const search = async (filters: TimelineSearchFilters): Promise<TimelineNode[]> => {
    const response = await fetchJson<{ results: TimelineNode[] }>(
      '/api/timeline-hierarchy/search',
      {
        method: 'POST',
        body: JSON.stringify(filters)
      }
    );
    return response.results || [];
  };

  const autoClassify = async (
    text: string,
    timestamp: string,
    metadata?: Record<string, unknown>
  ): Promise<AutoClassificationResult> => {
    const response = await fetchJson<{ classification: AutoClassificationResult }>(
      '/api/timeline-hierarchy/auto-classify',
      {
        method: 'POST',
        body: JSON.stringify({ text, timestamp, metadata })
      }
    );
    return response.classification;
  };

  const autoAssignTags = async (
    layer: TimelineLayer,
    nodeId: string
  ): Promise<string[]> => {
    const response = await fetchJson<{ tags: string[] }>(
      `/api/timeline-hierarchy/${layer}/${nodeId}/auto-tags`,
      {
        method: 'POST'
      }
    );
    return response.tags;
  };

  return {
    mythos,
    loading,
    recommendations,
    refresh,
    createNode,
    updateNode,
    getNode,
    getChildren,
    deleteNode,
    search,
    autoClassify,
    autoAssignTags
  };
};

