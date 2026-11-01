/**
 * The files a post's links lead to: each link is followed through the gateways until it reaches a
 * host.
 */
import { EngineError } from './errors.js';
import { gatewayOf } from './gateways/index.js';
import { externalIdOf, hostOf } from './hosts/index.js';
import { retry } from './http.js';
import { onCurrentDomain, webUrlOf } from './urls.js';

/**
 * @typedef {import('./hosts/index.js').HostFile} HostFile
 */

/**
 * Follows links to the files they lead to: every file once (found by its host and externalId), in
 * the order of the links (4KHDHub's HubCloud and HubDrive buttons lead to one file, which it gives
 * once, with the label of the first way to it). A link that is neither a gateway nor a file on a
 * known host is skipped. Every URL is moved to its site's current domain before it is read, files
 * too.
 *
 * A file's label is the first one on its way, which is the page nearest the post: HUBLinks'
 * "480p · Drive", not the "[HubCloud Server]" of the HubDrive page after it. The post's own label is
 * the caller's, which picked the link.
 *
 * @param {string[]} urls - The links' URLs: all of a post's (`links.map(({ url }) => url)`), or the
 *   one a user picked.
 * @param {import('./http.js').RequestOptions & { domains?: Record<string, string> }} [options]
 *   `domains`: as for onCurrentDomain (urls.js).
 * @returns {Promise<{ files: HostFile[], failures: EngineError[] }>} `failures`: every page that did
 *   not lead on, such as a dead GreenMotors link (`notFound`) or a stalled HubDrive (`transient`);
 *   the files of every other link are there.
 * @throws {TypeError} For one of `urls` that is not a web URL (a typo, a link `{ url, label }`):
 *   it would be skipped as if the page linked nothing. A URL a gateway page gives is the site's,
 *   and is skipped instead.
 * @throws {unknown} The caller's own reason, as it is, when the caller cancels (`signal`).
 */
export async function scrapeLinks(urls, { domains = {}, ...options } = {}) {
  for (const url of urls) if (!webUrlOf(url)) throw new TypeError(`Not a web URL: ${url}`);
  // Gateway pages, each read once (a post links some twice), for the link that reaches it first:
  // its files take that link's place. A gateway that leads back to a page read already ends there.
  const readPages = new Set();
  const failures = [];

  // The files `target` leads to, in page order: Promise.all keeps it, although pages load at once.
  // `target`: a URL as given, before it is moved to its current domain. `label`: the first label
  // on its way.
  const follow = async (target, label = null) => {
    const parsed = webUrlOf(target);
    if (!parsed) return [];
    const url = onCurrentDomain(parsed, domains);
    const gateway = gatewayOf(url);
    if (gateway) {
      if (readPages.has(url)) return [];
      readPages.add(url);
      let next;
      try {
        ({ links: next } = await retry(() => gateway.expand(url, options)));
      } catch (error) {
        if (!(error instanceof EngineError)) throw error;
        failures.push(error);
        return [];
      }
      const files = await Promise.all(next.map((link) => follow(link.url, label ?? link.label)));
      return files.flat();
    }
    const externalId = externalIdOf(url);
    if (!externalId) return [];
    return [{ host: hostOf(url).id, externalId, url, label }];
  };

  const files = new Map(); // By "host:externalId": each file as the first link reaches it.
  for (const file of (await Promise.all(urls.map((url) => follow(url)))).flat()) {
    const key = `${file.host}:${file.externalId}`;
    if (!files.has(key)) files.set(key, file);
  }
  return { files: [...files.values()], failures };
}
