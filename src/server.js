/**
 * Runs the API (README.md, Deploy): it makes the Fastify, as Fastify's boilerplate does, and sets the
 * API up on it. Vercel imports this file (an entrypoint that imports Fastify) and serves its default
 * export; npm start runs it, and it listens on PORT (3000) and HOST (127.0.0.1).
 */
import { pathToFileURL } from 'node:url';
import Fastify from 'fastify';
import { startDomains } from './domains.js';
import { appOptions, setUpApp } from './setup.js';
import { createEngine } from '../engine/index.js';

const { domains, fallbackBecause } = await startDomains();
const app = Fastify(appOptions({ logger: true }));
await setUpApp(app, { engine: createEngine({ domains }), domains });
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
