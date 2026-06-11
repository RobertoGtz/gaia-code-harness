/**
 * @fileoverview HTTP API Server for the Gaia Code Harness
 * @description Fastify-based REST API handling job creation, status checks, and spec approval
 * @module api/server
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { initDatabase } from '../db';
import { setupJobRoutes } from './routes/jobs';

/**
 * Start the Fastify HTTP server
 *
 * @param port - Port number to listen on (default: 3000)
 * @returns Fastify instance
 *
 * @example
 * const server = await startServer(3000);
 * // Server running on port 3000
 */
export async function startServer(port: number = 3000) {
  // Initialize database connection
  await initDatabase();

  const app = Fastify({
    logger: true,
  });

  // Enable CORS for cross-origin requests from Gaia Platform
  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  });

  // Health check endpoint for load balancers and monitoring
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  // Setup job management routes
  await setupJobRoutes(app);

  try {
    await app.listen({ port, host: '0.0.0.0' });
    console.log(`Server running on port ${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  return app;
}
