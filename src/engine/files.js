/**
 * A file on its host, resolved by the host's resolver: its name and size, and its downloads.
 */
import { EngineError } from './errors.js';
import { retry } from './http.js';
import { hostOf } from './hosts/index.js';
import { onCurrentDomain, webUrlOf } from './urls.js';

/**
 * Resolves a file into its downloads (2 or 3 requests; retried): the file's page, its download
 * page, and 10Gbps's redirects to the file, when the page has that server. The file's name and
 * size do not change; its downloads expire within minutes or hours.
 *
 * @param {string} url - A file, on any of its host's domains (a URL kept from earlier keeps the
 *   domain it was found on: hubcloud.foo, ...).
 * @param {import('./http.js').RequestOptions & { domains?: Record<string, string> }} [options]
 *   `domains`: as for onCurrentDomain (urls.js).
 * @returns {Promise<{ filename: string, sizeBytes: number, downloads: import('./hosts/index.js').Download[] }>}
 * @throws {EngineError} `unsupported` for a URL on a host the engine does not resolve, and the host
 *   resolver's errors.
 * @throws {TypeError} For a string that is not a web URL.
 * @throws {unknown} The caller's own reason, as it is, when the caller cancels (`signal`).
 */
export async function resolve(url, { domains = {}, ...options } = {}) {
  const parsed = webUrlOf(url);
  if (!parsed) throw new TypeError(`Not a web URL: ${url}`);
  const read = hostOf(parsed.href)?.resolve;
  if (!read) throw new EngineError('unsupported', 'The engine does not resolve files of this host', { url });
  return retry(() => read(onCurrentDomain(parsed, domains), options));
}
