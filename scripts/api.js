/**
 * Runs the API (docs/api.md): node scripts/api.js
 * The sites' current domains come from domains.json; when one changes, edit it and restart.
 * PORT (default 3000) and HOST (default 127.0.0.1; 0.0.0.0 to be reached from outside) set where
 * it listens.
 */
import { readFile } from 'node:fs/promises';
import { buildApp } from '../src/api/app.js';
import { createEngine } from '../src/engine/index.js';

const domains = JSON.parse(await readFile(new URL('../domains.json', import.meta.url), 'utf8'));
const app = await buildApp({ engine: createEngine({ domains }), domains, logger: true });
await app.listen({ port: Number(process.env.PORT ?? 3000), host: process.env.HOST ?? '127.0.0.1' });
