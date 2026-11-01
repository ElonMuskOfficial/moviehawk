/**
 * What the API's route tests share: an engine that answers as the test says, and the app on it.
 */
import { buildApp } from '../../src/api/app.js';

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

/** The app on `engine` and DOMAINS, ready for requests. */
export async function appWith(engine) {
  const app = await buildApp({ config: { current: () => ({ engine, domains: DOMAINS }), fallbackBecause: null } });
  await app.ready();
  return app;
}
