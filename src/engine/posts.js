/**
 * A post page, read by its provider: the post, and its download links in its site's sections.
 */
import { EngineError } from './errors.js';
import { retry } from './http.js';
import { providerOf } from './providers/index.js';
import { onCurrentDomain, webUrlOf } from './urls.js';

/**
 * Reads a post page (1 request; retried). identify tells what each link is.
 *
 * @param {string} url - A post page, on any of its site's domains.
 * @param {import('./http.js').RequestOptions & { domains?: Record<string, string> }} [options]
 *   `domains`: as for onCurrentDomain (urls.js).
 * @returns {Promise<{ post: import('./providers/index.js').Post, sections: import('./providers/index.js').Section[] }>}
 *   `sections`: the post's download links, as its provider reads its page: grouped as the site
 *   groups them, in page order; whatever gateway or host they lead to, so a host the engine does
 *   not know yet loses no link.
 * @throws {EngineError} `unsupported` for a URL on no site the engine reads, and the provider's
 *   errors.
 * @throws {TypeError} For a string that is not a web URL.
 * @throws {unknown} The caller's own reason, as it is, when the caller cancels (`signal`).
 */
export async function scrapePost(url, { domains = {}, ...options } = {}) {
  const parsed = webUrlOf(url);
  if (!parsed) throw new TypeError(`Not a web URL: ${url}`);
  const provider = providerOf(parsed.href);
  if (!provider) throw new EngineError('unsupported', `The engine does not read posts of ${parsed.hostname}`, { url });
  return retry(() => provider.post(onCurrentDomain(parsed, domains), options), { signal: options.signal });
}
