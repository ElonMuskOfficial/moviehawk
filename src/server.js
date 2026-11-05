/**
 * Runs the API (README.md, Deploy): it makes the Fastify, as Fastify's boilerplate does, and sets the
 * API up on it. Vercel imports this file (an entrypoint that imports Fastify) and serves its default
 * export; npm start runs it, and it listens on PORT (3000) and HOST (127.0.0.1).
 */
import { pathToFileURL } from 'node:url';
import Fastify from 'fastify';
import { redisFromEnv } from './cache.js';
import { startDomains } from './domains.js';
import { appOptions, setUpApp } from './setup.js';
import { createEngine } from '../engine/index.js';

const { domains, fallbackBecause } = await startDomains();
const app = Fastify(appOptions({ logger: true }));
// Vegadrop's link is waited for 20 s at most, so a file's other downloads come within the 30 s a
// request may take (README.md, Errors).
const redis = redisFromEnv();
await setUpApp(app, { engine: createEngine({ domains, waitMs: 20_000 }), domains, redis });
if (!redis) app.log.warn('No cache: KV_REST_API_URL and KV_REST_API_TOKEN are not set, so every request reads the sites');
if (fallbackBecause) app.log.warn(`Started with the fallback domains: the domains URL could not be used (${fallbackBecause})`);
await app.ready();

/** Vercel's handler: each request, as Fastify's own server would take it. */
export default function handler(request, response) {
  app.server.emit('request', request, response);
}

// Run, not imported (npm start): listen.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await app.listen({ port: Number(process.env.PORT ?? 3000), host: process.env.HOST ?? '127.0.0.1' });
}
