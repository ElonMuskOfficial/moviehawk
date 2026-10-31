/**
 * How the engine fetches pages: one browser identity, a timeout that covers the whole page, and
 * failures turned into EngineError by what the site said.
 */
import { setTimeout as sleep } from 'node:timers/promises';
import { EngineError } from './errors.js';

// One browser identity for every request: the sites serve challenge pages to unknown clients.
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

// Codes that another try cannot change: the site already answered, or the URL is not ours.
const FINAL_CODES = new Set(['notFound', 'unsupported']);

/**
 * Fetches a page's HTML, following redirects. `timeoutMs` covers the whole page, body included:
 * a host sometimes sends its headers and then stalls.
 *
 * @param {string} url
 * @param {{ fetch?: typeof fetch, timeoutMs?: number, signal?: AbortSignal, headers?: Record<string, string> }} [options]
 *   `signal`: the caller's own cancellation, on top of the timeout.
 * @returns {Promise<{ html: string, url: string }>} `url`: the page's address after redirects.
 * @throws {EngineError} `notFound` on HTTP 404 or 410; `transient` on any other HTTP error, a
 *   network error or the timeout.
 * @throws {TypeError} For a string that is not a URL: a mistake of the caller, not of the site.
 *   When the caller cancels (`signal`), its own reason is thrown as it is.
 */
export async function fetchHtml(url, { fetch: fetchFn = fetch, timeoutMs = 8000, signal, headers } = {}) {
  new URL(url);
  const timeout = AbortSignal.timeout(timeoutMs);
  try {
    const response = await fetchFn(url, {
      redirect: 'follow',
      headers: { ...HEADERS, ...headers },
      signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
    });
    if (!response.ok) {
      await response.body?.cancel();
      const code = response.status === 404 || response.status === 410 ? 'notFound' : 'transient';
      throw new EngineError(code, `HTTP ${response.status}`, { url, status: response.status });
    }
    return { html: await response.text(), url: response.url || url };
  } catch (error) {
    if (error instanceof EngineError || signal?.aborted) throw error;
    const message = timeout.aborted ? `No answer within ${timeoutMs} ms` : error.message;
    throw new EngineError('transient', message, { url, cause: error });
  }
}

/**
 * Runs `fn` until it succeeds, up to `attempts` times, waiting `delayMs` before the second try
 * and four times as long before each next one (1 s, then 4 s). The hosts stall for several seconds
 * under load (10.7 s measured, 2026-10-29), so a quick second try tends to meet the same stall.
 *
 * Only an EngineError that another try could change is retried: `transient` and `unrecognized`
 * (a challenge page often passes on the next try). Anything else is thrown at once: `notFound`
 * and `unsupported`, the caller's cancellation, and errors that are bugs.
 *
 * @template T
 * @param {() => Promise<T>} fn
 * @param {{ attempts?: number, delayMs?: number, signal?: AbortSignal }} [options] `signal` also
 *   ends a wait between tries.
 * @returns {Promise<T>}
 */
export async function retry(fn, { attempts = 3, delayMs = 1000, signal } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const retriable = error instanceof EngineError && !FINAL_CODES.has(error.code);
      if (!retriable || attempt >= attempts) throw error;
      await sleep(delayMs * 4 ** (attempt - 1), undefined, { signal });
    }
  }
}
