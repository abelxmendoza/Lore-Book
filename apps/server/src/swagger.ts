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
      title: 'LoreKeeper API',
      version: '1.0.0',
      description: 'API documentation for LoreKeeper - Your AI-powered life journal',
      contact: {
        name: 'API Support',
        email: 'support@lorekeeper.app',
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

const swaggerSpec = swaggerJsdoc(options);

export const setupSwagger = (app: Express) => {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'LoreKeeper API Documentation',
  }));

  // JSON endpoint for the spec
  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });
};

