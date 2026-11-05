/**
 * What the API's route tests share: an engine that answers as the test says, and the app on it.
 */
import { buildApp } from '../../src/setup.js';

export const DOMAINS = { hdhub4u: 'https://new10.hdhub4u.cl', '4khdhub': 'https://4khdhub.one' };

/**
 * An engine whose every function answers with `answer(...args)`, and records each call as
 * [function, ...args], without its options. Every call must have the request's signal, so the
 * engine stops when the request times out or its client disconnects.
 *
 * @param {(...args: any[]) => unknown} answer
 */
export function fakeEngine(answer) {
  const calls = [];
  const engine = Object.fromEntries(['scrapeListing', 'searchPosts', 'scrapePost', 'expand', 'resolve'].map((name) => [
    name,
    async (...args) => {
      const { signal } = args.pop();
      if (!(signal instanceof AbortSignal)) throw new Error(`${name} was called without the request's signal`);
      calls.push([name, ...args]);
      return answer(...args);
    },
  ]));
  return { engine, calls };
}

/**
 * Redis as the cache uses it: get, and set with an expiry, which the tests do not wait for. A value
 * is kept as JSON, as Upstash keeps it, so an answer read back is a copy.
 */
export function fakeRedis() {
  const kept = new Map();
  return {
    kept,
    get: async (key) => (kept.has(key) ? JSON.parse(kept.get(key)) : null),
    set: async (key, value, { pxat }) => {
      if (!(pxat > Date.now())) throw new Error(`set ${key} without an expiry to come`);
      kept.set(key, JSON.stringify(value));
      return 'OK';
    },
  };
}

/** The app on `engine` and DOMAINS, with a cache (a fake Redis, or `redis`), ready for requests. */
export async function appWith(engine, { redis = fakeRedis() } = {}) {
  const app = await buildApp({ engine, domains: DOMAINS, redis });
  await app.ready();
  return app;
}
