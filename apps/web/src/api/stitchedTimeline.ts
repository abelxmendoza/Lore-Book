import { fetchJson } from '../lib/api';

export type StitchedItemKind = 'moment' | 'event';

export type StitchedTimelineItem = {
  id: string;
  kind: StitchedItemKind;
  sourceId: string;
  sortTime: string;
  userSortIndex: number | null;
  title: string;
  body: string;
  userPresence?: 'attended' | 'heard_about' | 'unknown';
  temporalRole?: string;
};

export type StitchedTimelineResult = {
  scope_type: 'global' | 'life_arc';
  scope_id: string;
  scope_label: string | null;
  items: StitchedTimelineItem[];
  has_user_order: boolean;
};

export const stitchedTimelineApi = {
  get: (params?: {
    life_arc_id?: string;
    start_time?: string;
    end_time?: string;
    scope_type?: 'global' | 'life_arc';
  }) => {
    const qs = new URLSearchParams();
    if (params?.life_arc_id) qs.set('life_arc_id', params.life_arc_id);
    if (params?.start_time) qs.set('start_time', params.start_time);
    if (params?.end_time) qs.set('end_time', params.end_time);
    if (params?.scope_type) qs.set('scope_type', params.scope_type);
    const query = qs.toString();
    return fetchJson<StitchedTimelineResult>(
      `/api/chronology/stitched${query ? `?${query}` : ''}`
    );
  },

  saveOrder: (body: {
    scope_type: 'global' | 'life_arc';
    scope_id?: string;
    items: Array<{ kind: StitchedItemKind; id: string; sort_index: number }>;
  }) =>
    fetchJson<{ success: boolean; saved: number }>('/api/chronology/order', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
};
