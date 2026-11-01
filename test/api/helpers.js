/**
 * What the API's route tests share: an engine that answers as the test says, and the app on it.
 */
import { buildApp } from '../../src/api/app.js';

export const DOMAINS = { hdhub4u: 'https://new10.hdhub4u.cl', '4khdhub': 'https://4khdhub.one' };

/**
 * An engine whose every function answers with `answer(...args)`, and records each call as
 * [function, ...args].
 *
 * @param {(...args: any[]) => unknown} answer
 */
export function fakeEngine(answer) {
  const calls = [];
  const engine = Object.fromEntries(['scrapeListing', 'searchPosts', 'scrapePost', 'scrapeLinks', 'resolve'].map((name) => [
    name,
    async (...args) => {
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
