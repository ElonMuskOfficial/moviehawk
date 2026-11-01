/**
 * Runs the API (README.md, The API): npm start
 * The current domains come from the moviehawk-domains repo, or FALLBACK_DOMAINS when it cannot be
 * read at start (domains.js).
 * PORT (default 3000) and HOST (default 127.0.0.1; 0.0.0.0 to be reached from outside) set where
 * it listens.
 */
import { buildApp } from './app.js';
import { liveConfig } from './domains.js';
import { createEngine } from '../engine/index.js';

const config = await liveConfig({ makeEngine: (domains) => createEngine({ domains }) });
const app = await buildApp({ config, logger: true });
if (config.fallbackBecause) app.log.warn(`Started with the fallback domains: the domains URL could not be used (${config.fallbackBecause})`);
await app.listen({ port: Number(process.env.PORT ?? 3000), host: process.env.HOST ?? '127.0.0.1' });
