/**
 * A file on its host, read by the host's reader: its name and size, or its downloads.
 */
import { EngineError } from './errors.js';
import { retry } from './http.js';
import { hostOf } from './hosts/index.js';
import { onCurrentDomain, webUrlOf } from './urls.js';

/**
 * Reads a file's page on its host (1 request; retried): the file's name and size, as the page
 * states them.
 *
 * @param {string} url - A file, on any of its host's domains (stored files keep the domain they
 *   were found on: hubcloud.foo, ...).
 * @param {import('./http.js').RequestOptions & { domains?: Record<string, string> }} [options]
 *   `domains`: as for onCurrentDomain (urls.js).
 * @returns {Promise<{ filename: string, sizeBytes: number }>}
 * @throws {EngineError} `unsupported` for a URL on a host whose file pages the engine does not
 *   read, and the host reader's errors.
 * @throws {TypeError} For a string that is not a web URL.
 * @throws {unknown} The caller's own reason, as it is, when the caller cancels (`signal`).
 */
export async function scrapeFile(url, { domains = {}, ...options } = {}) {
  const parsed = webUrlOf(url);
  if (!parsed) throw new TypeError(`Not a web URL: ${url}`);
  const read = hostOf(parsed.href)?.scrapeFile;
  if (!read) throw new EngineError('unsupported', 'The engine does not read file pages of this host', { url });
  return retry(() => read(onCurrentDomain(parsed, domains), options));
}

/**
 * Resolves a file into its downloads (3 requests and more; retried): the file's page, its
 * download page, and the redirects to the file. Downloads expire within minutes or hours;
 * scrapeFile's answer does not.
 *
 * @param {string} url - As for scrapeFile.
 * @param {import('./http.js').RequestOptions & { domains?: Record<string, string> }} [options]
 *   As for scrapeFile.
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
