/**
 * Swagger/OpenAPI Documentation Setup
 * 
 * This file sets up Swagger documentation for the API.
 * Run the server and visit /api-docs to see the documentation.
 */

import { Express } from 'express';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'LoreBook API',
      version: '1.0.0',
      description: 'API documentation for LoreBook - Your AI-powered life story companion',
      contact: {
        name: 'API Support',
        email: 'support@lorebook.app',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: process.env.API_URL || 'http://localhost:4000',
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
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
    tags: [
      { name: 'Entries', description: 'Journal entry operations' },
      { name: 'Chapters', description: 'Chapter management' },
      { name: 'Characters', description: 'Character management' },
      { name: 'Chat', description: 'AI chat interface' },
      { name: 'Timeline', description: 'Timeline operations' },
      { name: 'Search', description: 'Search and discovery' },
      { name: 'User', description: 'User account management' },
      { name: 'Onboarding', description: 'User onboarding' },
      { name: 'Continuity', description: 'Continuity checking' },
      { name: 'Admin', description: 'Admin operations' },
    ],
  },
  apis: [
    './src/routes/*.ts',
    './src/routes/**/*.ts',
  ],
};

/**
 * Generate the OpenAPI spec defensively. swagger-jsdoc scans source files with
 * an old bundled `glob`; a newer `minimatch` encodes `**` as a GLOBSTAR Symbol
 * that `pattern.join('/')` cannot stringify, which threw at import time and
 * crashed the server on boot. API docs are dev-only — never let them take down
 * the API. Fall back to the base definition (no per-route annotations).
 */
const swaggerSpec: object = (() => {
  try {
    return swaggerJsdoc(options) as object;
  } catch (err) {
    console.warn(
      '[swagger] Spec generation failed; serving base definition without route annotations.',
      err instanceof Error ? err.message : err
    );
    return { ...options.definition, paths: {} } as object;
  }
})();

export const setupSwagger = (app: Express) => {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'LoreBook API Documentation',
  }));

  // JSON endpoint for the spec
  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });
};

