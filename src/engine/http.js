/**
 * How the engine asks the sites: one browser identity, a timeout that covers the whole answer, and
 * failures turned into EngineError by what the site said.
 */
import { setTimeout as sleep } from 'node:timers/promises';
import { EngineError } from './errors.js';

// One browser identity for every request: the sites serve challenge pages to unknown clients.
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

// Failures another try can change: the site did not answer, or answered a challenge page.
const RETRIED = new Set(['transient', 'unrecognized']);
const ATTEMPTS = 3;

/**
 * Fetches a page's HTML, following redirects. `timeoutMs` covers the whole page, body included:
 * a host sometimes sends its headers and then stalls.
 *
 * @param {string} url
 * @param {RequestOptions} [options]
 * @returns {Promise<{ html: string, url: string }>} `url`: the page's address after redirects.
 * @throws {EngineError} `notFound` on HTTP 404 or 410; `transient` on any other HTTP error, a
 *   network error or the timeout.
 * @throws {unknown} The caller's own reason, as it is, when the caller cancels (`signal`).
 */
export function fetchHtml(url, options) {
  return request(url, 'GET', options, async (response) => ({ html: await response.text(), url: response.url || url }));
}

/**
 * Fetches a JSON answer, such as a site's search API's.
 *
 * @param {string} url
 * @param {RequestOptions} [options]
 * @returns {Promise<unknown>} The parsed JSON.
 * @throws {EngineError} As fetchHtml; and `unrecognized` for an answer that is not JSON (a challenge
 *   page). The caller's reason on cancellation, as fetchHtml.
 */
export function fetchJson(url, options) {
  return request(url, 'GET', options, async (response) => {
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new EngineError('unrecognized', 'The answer is not JSON', { url });
    }
  });
}

/**
 * Follows a URL's redirects and returns where they end, without reading that page: it can be the
 * file itself (a HEAD request asks for no body).
 *
 * @param {string} url
 * @param {RequestOptions} [options]
 * @returns {Promise<string>} The address after redirects.
 * @throws {EngineError} As fetchHtml; and the caller's reason on cancellation.
 */
export function followRedirects(url, options) {
  return request(url, 'HEAD', options, async (response) => {
    await response.body?.cancel();
    return response.url || url;
  });
}

/**
 * @typedef {{ fetch?: typeof fetch, timeoutMs?: number, signal?: AbortSignal,
 *   headers?: Record<string, string> }} RequestOptions
 *   `signal`: the caller's own cancellation, on top of the timeout. `headers`: on top of the
 *   engine's, for a site that asks for more (HDHub4u's search API answers 403 without a Referer).
 */

/**
 * One request with the engine's identity, timeout and failures; `read` turns the answer into the
 * result, within the timeout.
 *
 * @template T
 * @param {string} url
 * @param {'GET' | 'HEAD'} method
 * @param {RequestOptions} [options]
 * @param {(response: Response) => Promise<T>} read
 * @returns {Promise<T>}
 */
async function request(url, method, { fetch: fetchFn = fetch, timeoutMs = 8000, signal, headers } = {}, read) {
  const timeout = AbortSignal.timeout(timeoutMs);
  // The site's hostname, in every message: an API client sees the message alone, and "HTTP 404"
  // would not say whether the API or the site answered it.
  const { hostname } = new URL(url);
  try {
    const response = await fetchFn(url, {
      method,
      redirect: 'follow',
      headers: { ...HEADERS, ...headers },
      signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
    });
    if (!response.ok) {
      await response.body?.cancel();
      const code = response.status === 404 || response.status === 410 ? 'notFound' : 'transient';
      throw new EngineError(code, `${hostname} answered HTTP ${response.status}`, { url, status: response.status });
    }
    return await read(response);
  } catch (error) {
    if (error instanceof EngineError || signal?.aborted) throw error;
    const message = timeout.aborted ? `${hostname} did not answer within ${timeoutMs} ms` : `${hostname} did not answer: ${error.message}`;
    throw new EngineError('transient', message, { url, cause: error });
  }
}

/**
 * Runs `fn` until it succeeds, up to 3 times, waiting `delayMs` before the second try and four
 * times as long before the third (1 s, then 4 s). The hosts stall for several seconds
 * under load (10.7 s measured, 2026-10-29), so a quick second try tends to meet the same stall.
 *
 * Only an EngineError that another try could change is retried: `transient` and `unrecognized`
 * (a challenge page often passes on the next try). Anything else is thrown at once: `notFound`,
 * the caller's cancellation, and errors that are bugs.
 *
 * @template T
 * @param {() => Promise<T>} fn
 * @param {{ delayMs?: number }} [options]
 * @returns {Promise<T>}
 */
export async function retry(fn, { delayMs = 1000 } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const retriable = error instanceof EngineError && RETRIED.has(error.code);
      if (!retriable || attempt === ATTEMPTS) throw error;
      await sleep(delayMs * 4 ** (attempt - 1));
    }
  }
}
