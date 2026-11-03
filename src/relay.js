/**
 * The relay (README.md, Relay): V-Cloud answers the API on Vercel HTTP 403, its Cloudflare blocking
 * Vercel's addresses, and answers it on Wasmer (live, 2026-11-03: 3 of 3 files each). So the API
 * on Wasmer reads V-Cloud's pages for the API on Vercel: `GET /v1/relay?url=`, and the engine's
 * `fetch` on Vercel sends V-Cloud's requests there (relayFetch). Only V-Cloud's: the relay is open,
 * and reads no other site.
 */
import { hasLabel, webUrlOf } from '../engine/urls.js';
import { ProblemError } from './problems.js';

// The sites the relay reads, by hostname label: V-Cloud's domains (vcloud.beer, vcloud.zip).
const RELAYED = ['vcloud'];

// The request's headers the relay passes on: the engine's identity, and what V-Cloud asks for.
const PASSED = ['user-agent', 'accept', 'referer', 'cookie'];

// The header that tells the address the relay's request ended at, after redirects.
const FINAL_URL = 'x-relay-url';

/** @returns {boolean} Whether the relay reads `url`: a web URL on a site it relays. */
export function isRelayed(url) {
  const parsed = webUrlOf(url);
  return Boolean(parsed && RELAYED.some((label) => hasLabel(parsed, label)));
}

/**
 * The relay's route: GET (or HEAD) `/v1/relay?url=<a URL>` reads the URL, following redirects, with
 * the request's own identity and Referer and Cookie, and answers as the site did: its status, its
 * Content-Type and its body, and where it ended (`X-Relay-URL`). Nothing is kept.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {{ fetch?: typeof fetch }} [options] `fetch`: for the site's request (the tests' fake).
 */
export async function relayRoutes(app, { fetch: fetchFn = fetch } = {}) {
  app.route({
    method: ['GET', 'HEAD'],
    url: '/v1/relay',
    schema: { querystring: { type: 'object', required: ['url'], properties: { url: { type: 'string', minLength: 1 } } } },
    handler: async (request, reply) => {
      const { url } = request.query;
      if (!isRelayed(url)) throw new ProblemError(400, 'invalidArgument', `The relay reads V-Cloud only, not ${url}`);
      const headers = Object.fromEntries(PASSED.filter((name) => request.headers[name]).map((name) => [name, request.headers[name]]));
      const answer = await fetchFn(url, { method: request.method, headers, redirect: 'follow', signal: request.signal });
      reply.code(answer.status).header(FINAL_URL, answer.url || url);
      const type = answer.headers.get('content-type');
      if (type) reply.type(type);
      if (request.method === 'HEAD') {
        await answer.body?.cancel();
        return reply.send();
      }
      return reply.send(await answer.text());
    },
  });
}

/**
 * The engine's `fetch` on the API that relays: V-Cloud's requests through the relay at `relayUrl`,
 * every other one as it is. The answer is the site's, as the relay gives it, at the address the
 * relay's request ended at.
 *
 * @param {string} relayUrl - The API that relays, "https://moviehawk.wasmer.app".
 * @param {typeof fetch} [fetchFn]
 * @returns {typeof fetch}
 */
export function relayFetch(relayUrl, fetchFn = fetch) {
  return async (url, init = {}) => {
    if (!isRelayed(String(url))) return fetchFn(url, init);
    const relayed = new URL('/v1/relay', relayUrl);
    relayed.searchParams.set('url', String(url));
    const answer = await fetchFn(relayed.href, { ...init, redirect: 'follow' });
    // A HEAD, and a status without content (204, 304), has no body.
    const body = init.method === 'HEAD' || [204, 205, 304].includes(answer.status) ? null : await answer.text();
    const response = new Response(body, { status: answer.status, headers: answer.headers });
    Object.defineProperty(response, 'url', { value: answer.headers.get(FINAL_URL) ?? String(url) });
    return response;
  };
}
