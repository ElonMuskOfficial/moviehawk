/**
 * The API's cache (README.md, The API, Cache): each route's answer, in Upstash Redis, for as long as
 * the route says. Every running copy of the API shares it. A repeat answers without reading the
 * sites. Errors are not kept: the next request tries again.
 */
import { Redis } from '@upstash/redis';

// Redis that does not answer within this is skipped, and the sites are read, as on a miss. Not
// retried: a retry would take longer than reading the site.
const TIMEOUT_MS = 1000;

/**
 * The query schema of a route that answers through `cached`: what it reads, and nothing else.
 * Fastify drops the rest from `request.query`, so the cache knows a request by what it asks.
 *
 * @param {Record<string, object>} [properties]
 * @param {string[]} [required]
 */
export const queryOf = (properties = {}, required = []) => ({ type: 'object', required, properties, additionalProperties: false });

/**
 * Upstash Redis, from the variables its Vercel integration sets; null without them (a machine
 * without .env's): no cache.
 *
 * @param {Record<string, string | undefined>} [env]
 * @returns {Redis | null}
 */
export function redisFromEnv(env = process.env) {
  const { KV_REST_API_URL: url, KV_REST_API_TOKEN: token } = env;
  if (!url || !token) return null;
  // `retries: 0`, not `retry: false`, which tries a failed request once more (@upstash/redis 1.41).
  return new Redis({ url, token, retry: { retries: 0 }, signal: () => AbortSignal.timeout(TIMEOUT_MS) });
}

// Keys start with the deployment: one that changes an answer's shape never reads the old shape,
// which expires on its own.
const VERSION = process.env.VERCEL_DEPLOYMENT_ID ?? 'local';

/**
 * @param {Pick<Redis, 'get' | 'set'> | null} redis - Null: every request reads the sites.
 * @returns The `cached` function a route answers through: one cache for the app.
 */
export function createCache(redis) {
  /**
   * The route's answer for what the request asks: the kept one, or `load`'s, kept for `ttlMs`. Its
   * `Cache-Control` lets the client keep it for the time it has left. Kept by the route, its params
   * and its query (queryOf), not by the URL: another encoding of a name, or a query the route does
   * not read, is the same answer.
   *
   * @template T
   * @param {import('fastify').FastifyRequest} request
   * @param {import('fastify').FastifyReply} reply
   * @param {number | ((answer: T) => number)} ttlMs - Or by the answer.
   * @param {() => Promise<T>} load
   * @returns {Promise<T>}
   */
  return async function cached(request, reply, ttlMs, load) {
    const query = Object.entries(request.query).sort(([a], [b]) => (a < b ? -1 : 1));
    const key = `${VERSION}:${JSON.stringify([request.routeOptions.url, request.params, query])}`;
    let kept = await tryRedis(request, () => redis?.get(key));
    if (!kept) {
      const answer = await load();
      kept = { answer, expiresAt: Date.now() + (typeof ttlMs === 'function' ? ttlMs(answer) : ttlMs) };
      await tryRedis(request, () => redis?.set(key, kept, { pxat: kept.expiresAt }));
    }
    // Rounded down: the client keeps it no longer than it stays true.
    reply.header('cache-control', `public, max-age=${Math.max(0, Math.floor((kept.expiresAt - Date.now()) / 1000))}`);
    return kept.answer;
  };
}

/**
 * Redis's answer, or null when it failed: a cache that fails is a miss, never an error.
 *
 * @template T
 * @param {import('fastify').FastifyRequest} request
 * @param {() => Promise<T> | undefined} command
 * @returns {Promise<T | null>}
 */
async function tryRedis(request, command) {
  try {
    return (await command()) ?? null;
  } catch (error) {
    request.log.warn(`The cache failed, so the sites are read: ${error.message}`);
    return null;
  }
}
