/**
 * The API's cache (README.md, The API, Cache): each route's answer, in memory, for as long as the
 * route says. A repeat answers without reading the sites. Errors are not kept: the next request
 * tries again.
 */
import { LRUCache } from 'lru-cache';

// Answers kept at most: a listing page's is the largest, about 30 KB, so 500 stay under 15 MB.
const MAX_ANSWERS = 500;

/**
 * @returns The `cached` function a route answers through: one cache for the app.
 */
export function createCache() {
  const answers = new LRUCache({ max: MAX_ANSWERS });

  /**
   * The route's answer for this request's URL: the kept one, or `load`'s, kept for `ttlMs`. Its
   * `Cache-Control` lets the client keep it for the time it has left here.
   *
   * @template T
   * @param {import('fastify').FastifyRequest} request
   * @param {import('fastify').FastifyReply} reply
   * @param {number | ((answer: T) => number)} ttlMs - Or by the answer: 0 keeps it not at all.
   * @param {() => Promise<T>} load
   * @returns {Promise<T>}
   */
  return async function cached(request, reply, ttlMs, load) {
    const key = request.url;
    let answer = answers.get(key);
    if (answer === undefined) {
      answer = await load();
      const ttl = typeof ttlMs === 'function' ? ttlMs(answer) : ttlMs;
      if (ttl === 0) return answer;
      answers.set(key, answer, { ttl });
    }
    // Rounded down: the client keeps it no longer than it stays here.
    reply.header('cache-control', `public, max-age=${Math.floor(answers.getRemainingTTL(key) / 1000)}`);
    return answer;
  };
}
