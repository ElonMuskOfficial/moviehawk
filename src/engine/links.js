/**
 * What a link is, and where a gateway's page leads: the pieces a consumer makes its own flow of
 * (the API stops where its user chooses; another consumer may follow every link to its files).
 */
import { EngineError } from './errors.js';
import { gatewayOf } from './gateways/index.js';
import { externalIdOf, hostOf } from './hosts/index.js';
import { retry } from './http.js';
import { onCurrentDomain, webUrlOf } from './urls.js';

/**
 * @typedef {{ type: 'gateway', id: string } | { type: 'file', id: string, resolves: boolean }} LinkKind
 *   A gateway page the engine reads (`expand`), or a file on a host. `id`: the gateway's or the
 *   host's ("greenmotors", "hubcloud"). `resolves`: when `resolve` reads the file's downloads.
 */

/**
 * What a link is, from its URL alone (no request).
 *
 * @param {string} url
 * @returns {LinkKind | null} null for anything else: a page of a host that names no file (HubCloud's
 *   "/tg/go" Telegram link), a site the engine does not know, a string that is not a web URL.
 */
export function identify(url) {
  const gateway = gatewayOf(url);
  if (gateway) return { type: 'gateway', id: gateway.id };
  if (!externalIdOf(url)) return null;
  const host = hostOf(url);
  return { type: 'file', id: host.id, resolves: Boolean(host.resolve) };
}

/**
 * Reads one gateway page and returns where it leads, in page order, as the page gives it (1
 * request; retried): GreenMotors' one destination, HUBLinks' links, a HubDrive file page's server
 * buttons, a HubDrive pack's file pages. The page is read on its site's current domain.
 *
 * @param {string} url - A gateway page (`identify(url).type === 'gateway'`), on any of its domains.
 * @param {import('./http.js').RequestOptions & { domains?: Record<string, string> }} [options]
 *   `domains`: as for onCurrentDomain (urls.js).
 * @returns {Promise<{ links: import('./html.js').Link[] }>} Every link, as the site gave it: a link
 *   the engine does not know, or a torrent's, is the caller's to skip (`identify`).
 * @throws {EngineError} `unsupported` for a URL that is no gateway page, and the gateway's errors.
 * @throws {TypeError} For a string that is not a web URL.
 * @throws {unknown} The caller's own reason, as it is, when the caller cancels (`signal`).
 */
export async function expand(url, { domains = {}, ...options } = {}) {
  const parsed = webUrlOf(url);
  if (!parsed) throw new TypeError(`Not a web URL: ${url}`);
  const gateway = gatewayOf(parsed.href);
  if (!gateway) throw new EngineError('unsupported', `The engine reads no gateway page at ${parsed.href}`, { url });
  const current = onCurrentDomain(parsed, domains);
  return retry(() => gateway.expand(current, options), { signal: options.signal });
}
