/**
 * Runs the API (README.md, Deploy): it makes the Fastify, as Fastify's boilerplate does, and sets the
 * API up on it. Vercel imports this file (an entrypoint that imports Fastify) and serves its default
 * export; npm start runs it, and it listens on PORT (3000) and HOST (127.0.0.1).
 */
import { pathToFileURL } from 'node:url';
import Fastify from 'fastify';
import { startDomains } from './domains.js';
import { relayFetch } from './relay.js';
import { appOptions, setUpApp } from './setup.js';
import { createEngine } from '../engine/index.js';

// V-Cloud answers Vercel's addresses HTTP 403, and Wasmer's not: on Vercel (which sets VERCEL), the
// engine reads V-Cloud through the API on Wasmer (relay.js). RELAY_URL names another, or "" none.
const RELAY_URL = process.env.RELAY_URL ?? (process.env.VERCEL ? 'https://moviehawk.wasmer.app' : '');

const { domains, fallbackBecause } = await startDomains();
const app = Fastify(appOptions({ logger: true }));
// Vegadrop's link is waited for 20 s at most, so a file's other downloads come within the 30 s a
// request may take (README.md, Errors).
const engine = createEngine({ domains, waitMs: 20_000, ...(RELAY_URL && { fetch: relayFetch(RELAY_URL) }) });
await setUpApp(app, { engine, domains });
if (RELAY_URL) app.log.info(`Reads V-Cloud through the relay at ${RELAY_URL}`);
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
