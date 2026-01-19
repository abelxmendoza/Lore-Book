import swaggerJsdoc from 'swagger-jsdoc';

import { config } from '../config.js';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Lore Keeper API',
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
        url: 'https://api.lorekeeper.app',
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

export const swaggerSpec = swaggerJsdoc(options);

