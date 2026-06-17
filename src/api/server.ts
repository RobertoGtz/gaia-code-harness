/**
 * @fileoverview HTTP API Server for the Gaia Code Harness
 * @description Fastify-based REST API handling job creation, status checks, and spec approval
 * @module api/server
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { initDatabase } from '../db';
import { setStateBackend } from '../state';
import { PostgresBackend } from '../state/postgres-backend';
import { setupJobRoutes }     from './routes/jobs';
import { setupWebhookRoutes } from './routes/webhook';

// ─── Terminal helpers ──────────────────────────────────────────────────────
const C = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  cyan:    '\x1b[36m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  red:     '\x1b[31m',
  gray:    '\x1b[90m',
  blue:    '\x1b[34m',
};

function ts(): string {
  return `${C.gray}${new Date().toLocaleTimeString('en-GB')}${C.reset}`;
}

function serverLog(method: string, url: string, status: number, ms: number): void {
  const statusColor = status >= 500 ? C.red : status >= 400 ? C.yellow : C.green;
  const methodColor = method === 'POST' ? C.cyan : method === 'GET' ? C.blue : C.yellow;
  console.log(
    `${ts()} ${C.bold}${C.gray}[HTTP]${C.reset}  ` +
    `${C.bold}${methodColor}${method.padEnd(6)}${C.reset} ` +
    `${url.padEnd(30)} ` +
    `${C.bold}${statusColor}${status}${C.reset}  ` +
    `${C.gray}${ms.toFixed(0)}ms${C.reset}`
  );
}

/**
 * Start the Fastify HTTP server
 *
 * @param port - Port number to listen on (default: 3000)
 * @returns Fastify instance
 */
export async function startServer(port: number = 3000) {
  // Initialize database connection and register Postgres state backend
  await initDatabase();
  setStateBackend(new PostgresBackend());

  const app = Fastify({
    logger: false,
  });

  // Log every request in a clean human-readable format
  app.addHook('onResponse', (request, reply, done) => {
    const ms = reply.elapsedTime;
    serverLog(request.method, request.url, reply.statusCode, ms);
    done();
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

  // Setup inbound webhook trigger route (Jira / Slack / generic)
  await setupWebhookRoutes(app);

  try {
    await app.listen({ port, host: '0.0.0.0' });
    const line = '─'.repeat(50);
    console.log(`\n${C.bold}${C.cyan}${line}${C.reset}`);
    console.log(`${C.bold}${C.cyan}  GAIA Code Harness  —  ready on :${port}${C.reset}`);
    console.log(`${C.bold}${C.cyan}${line}${C.reset}\n`);
  } catch (err) {
    console.error(`${C.red}✖ Failed to start server:${C.reset}`, err);
    process.exit(1);
  }

  return app;
}
