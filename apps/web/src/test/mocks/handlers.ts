import { http, HttpResponse } from 'msw';

// Use relative URLs for MSW - it will match any base URL
const API_BASE = process.env.VITE_API_URL || 'http://localhost:3000';

export const handlers = [
  // Health check — prevents MockDataContext from flipping isMockEnabled=true in tests
  http.get(`${API_BASE}/api/health`, () => {
    return HttpResponse.json({ status: 'ok' });
  }),

  http.get(`${API_BASE}/api/health/db`, () => {
    return HttpResponse.json({
      status: 'ok',
      missingTables: [],
      lastSchemaSync: null,
      storage: {
        status: 'ok',
        databaseBytes: 50_000_000,
        walBytes: 1_000_000,
        quotaBytes: 524_288_000,
        utilizationRatio: 0.095,
        checkedAt: new Date().toISOString(),
      },
      upgrade: {
        status: 'ok',
        postgresVersion: '15.8',
        postgresMajor: 15,
        cronJobRunDetailsRows: 0,
        deprecatedExtensions: [],
        enabledExtensions: [{ name: 'vector', schema: 'extensions', version: '0.8.0' }],
        warnings: [],
      },
      connection: {
        databaseUrlConfigured: false,
        sslMode: null,
        sslEnforcementReady: false,
      },
    });
  }),

  // Entries
  http.get(`${API_BASE}/api/entries`, () => {
    return HttpResponse.json({
      entries: [
        {
          id: '1',
          content: 'Test entry content',
          timestamp: new Date().toISOString(),
          tags: [],
        },
      ],
    });
  }),

  http.post(`${API_BASE}/api/entries`, () => {
    return HttpResponse.json({
      id: '2',
      content: 'New entry',
      timestamp: new Date().toISOString(),
    });
  }),

  // Timeline
  http.get(`${API_BASE}/api/timeline`, () => {
    return HttpResponse.json({
      timeline: [
        {
          id: '1',
          content: 'Test timeline entry',
          timestamp: new Date().toISOString(),
        },
      ],
    });
  }),

  // Chapters
  http.get(`${API_BASE}/api/chapters`, () => {
    return HttpResponse.json({
      chapters: [],
    });
  }),

  // Evolution
  http.get(`${API_BASE}/api/evolution`, () => {
    return HttpResponse.json({
      evolution: [],
    });
  }),

  // Tags
  http.get(`${API_BASE}/api/tags`, () => {
    return HttpResponse.json({
      tags: [],
    });
  }),

  // Characters
  http.get(`${API_BASE}/api/characters`, () => {
    return HttpResponse.json({
      characters: [],
    });
  }),

  // Timezone
  http.post(`${API_BASE}/api/time/timezone`, () => {
    return HttpResponse.json({
      timezone: 'UTC',
    });
  }),
];
