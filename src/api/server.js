/**
 * Runs the API (README.md, The API): npm start
 * The current domains come from the moviehawk-domains repo, or FALLBACK_DOMAINS when it cannot be
 * read at start (domains.js).
 * PORT (default 3000) and HOST (default 127.0.0.1; 0.0.0.0 to be reached from outside) set where
 * it listens.
 */
import { buildApp } from './app.js';
import { startDomains } from './domains.js';
import { createEngine } from '../engine/index.js';

const { domains, fallbackBecause } = await startDomains();
const app = await buildApp({ engine: createEngine({ domains }), domains, logger: true });
if (fallbackBecause) app.log.warn(`Started with the fallback domains: the domains URL could not be used (${fallbackBecause})`);
await app.listen({ port: Number(process.env.PORT ?? 3000), host: process.env.HOST ?? '127.0.0.1' });
