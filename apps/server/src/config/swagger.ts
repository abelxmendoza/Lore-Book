import swaggerJsdoc from 'swagger-jsdoc';

import { config } from '../config.js';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Lore Book API',
      version: '1.0.0',
      description: 'AI-powered journaling platform API by Omega Technologies',
      contact: {
        name: 'Omega Technologies',
      },
      license: {
        name: 'Private',
      },
    },
    servers: [
      {
        url: `http://localhost:${config.port}`,
        description: 'Development server',
      },
      {
        url: 'https://api.lorebook.app',
        description: 'Production server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Supabase JWT token or dev token',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              description: 'Error message',
            },
            details: {
              type: 'object',
              description: 'Additional error details',
            },
          },
        },
        Entry: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            user_id: { type: 'string' },
            content: { type: 'string' },
            date: { type: 'string', format: 'date-time' },
            tags: { type: 'array', items: { type: 'string' } },
            chapter_id: { type: 'string', format: 'uuid', nullable: true },
            mood: { type: 'string', nullable: true },
            summary: { type: 'string', nullable: true },
            source: { type: 'string' },
            metadata: { type: 'object' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        Chapter: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            user_id: { type: 'string' },
            title: { type: 'string' },
            start_date: { type: 'string', format: 'date-time' },
            end_date: { type: 'string', format: 'date-time', nullable: true },
            description: { type: 'string', nullable: true },
            summary: { type: 'string', nullable: true },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        Character: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            user_id: { type: 'string' },
            name: { type: 'string' },
            alias: { type: 'array', items: { type: 'string' } },
            pronouns: { type: 'string', nullable: true },
            archetype: { type: 'string', nullable: true },
            role: { type: 'string', nullable: true },
            status: { type: 'string' },
            summary: { type: 'string', nullable: true },
            tags: { type: 'array', items: { type: 'string' } },
            metadata: { type: 'object' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        Task: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            user_id: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string', nullable: true },
            category: { type: 'string' },
            status: { type: 'string' },
            priority: { type: 'integer' },
            due_date: { type: 'string', format: 'date-time', nullable: true },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ['./src/routes/**/*.ts', './src/controllers/**/*.ts'],
};

/**
 * Build the OpenAPI spec defensively. swagger-jsdoc scans source files via an
 * old bundled `glob`; a newer `minimatch` represents `**` as a GLOBSTAR Symbol
 * that its `pattern.join('/')` cannot stringify, which previously threw at
 * import time and took the entire server down on boot. API docs are a
 * dev-convenience — never let them crash the API. Fall back to the base
 * definition (no per-route annotations) if generation fails.
 */
function buildSwaggerSpec(): object {
  try {
    return swaggerJsdoc(options) as object;
  } catch (err) {
    console.warn(
      '[swagger] Spec generation failed; serving base definition without route annotations.',
      err instanceof Error ? err.message : err
    );
    return { ...options.definition, paths: {} } as object;
  }
}

export const swaggerSpec = buildSwaggerSpec();

