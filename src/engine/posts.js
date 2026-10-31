/**
 * A post page, read by its provider: the post, and its links that lead somewhere the engine knows.
 */
import { EngineError } from './errors.js';
import { gatewayOf } from './gateways/index.js';
import { hostOf } from './hosts/index.js';
import { retry } from './http.js';
import { providerOf } from './providers/index.js';
import { onCurrentDomain, webUrlOf } from './urls.js';

/**
 * Reads a post page (1 request; retried). scrapeLinks follows the links to their files.
 *
 * @param {string} url - A post page, on any of its site's domains.
 * @param {import('./http.js').RequestOptions & { domains?: Record<string, string> }} [options]
 *   `domains`: as for onCurrentDomain (urls.js).
 * @returns {Promise<{ post: import('./providers/index.js').Post, links: import('./providers/index.js').PostLink[] }>}
 *   `links`: the post's links to a gateway or a known host, in page order; none can be a glitch of
 *   the site. The others (the site's own pages, WhatsApp, IMDb, screenshots) are left out.
 * @throws {EngineError} `unsupported` for a URL on no site the engine reads, and the provider's
 *   errors.
 * @throws {TypeError} For a string that is not a web URL.
 * @throws {unknown} The caller's own reason, as it is, when the caller cancels (`signal`).
 */
export async function scrapePost(url, { domains = {}, ...options } = {}) {
  const parsed = webUrlOf(url);
  if (!parsed) throw new TypeError(`Not a web URL: ${url}`);
  const provider = providerOf(parsed.href);
  if (!provider) throw new EngineError('unsupported', 'The engine does not read posts of this site', { url });
  const { post, links } = await retry(() => provider.post(onCurrentDomain(parsed, domains), options));
  return { post, links: links.filter((link) => gatewayOf(link.url) || hostOf(link.url)) };
}
