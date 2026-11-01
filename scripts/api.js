/**
 * Runs the API (docs/api.md): node scripts/api.js
 * PORT (default 3000) and HOST (default 127.0.0.1; 0.0.0.0 to be reached from outside) set where
 * it listens.
 */
import { buildApp } from '../src/api/app.js';

const app = await buildApp({ logger: true });
await app.listen({ port: Number(process.env.PORT ?? 3000), host: process.env.HOST ?? '127.0.0.1' });
