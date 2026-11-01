/**
 * Runs the API (docs/api.md): node scripts/api.js
 * The sites' current domains come from the moviehawk-domains repo (src/api/domains.js), or from
 * domains.json here when GitHub does not answer at start.
 * PORT (default 3000) and HOST (default 127.0.0.1; 0.0.0.0 to be reached from outside) set where
 * it listens.
 */
import { readFile } from 'node:fs/promises';
import { buildApp } from '../src/api/app.js';
import { liveConfig } from '../src/api/domains.js';
import { createEngine } from '../src/engine/index.js';

const bundled = JSON.parse(await readFile(new URL('../domains.json', import.meta.url), 'utf8'));
const config = await liveConfig({ bundled, makeEngine: (domains) => createEngine({ domains }) });
const app = await buildApp({ config, logger: true });
if (config.startError) app.log.warn(`Domains from domains.json: GitHub did not give them (${config.startError})`);
await app.listen({ port: Number(process.env.PORT ?? 3000), host: process.env.HOST ?? '127.0.0.1' });
