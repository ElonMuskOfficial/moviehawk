/**
 * The files a post's links lead to: each link is followed through the gateways until it reaches a
 * host.
 */
import { EngineError } from './errors.js';
import { gatewayOf } from './gateways/index.js';
import { externalIdOf, hostOf } from './hosts/index.js';
import { retry } from './http.js';
import { onCurrentDomain, webUrlOf } from './urls.js';

// Gateways in a row a link may pass before the engine stops following it, so a gateway that
// leads to itself under new URLs cannot keep it busy. Live, a link passes at most 3
// (GreenMotors → HUBLinks → HubDrive → HubCloud, 2026-10-31: 1,122 pages of 14 posts).
const MAX_GATEWAYS = 5;

/**
 * @typedef {import('./hosts/index.js').HostFile} HostFile
 * @typedef {{ type: 'gateway' | 'file' | 'skipped' | 'failure', url: string, detail: string | null }} EngineEvent
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
 * @param {import('./http.js').RequestOptions & {
 *   domains?: Record<string, string>,
 *   onEvent?: (event: EngineEvent) => void,
 * }} [options] `domains`: as for onCurrentDomain (urls.js). `onEvent`: what happened to each link,
 *   for logs.
 * @returns {Promise<{ files: HostFile[], failures: EngineError[] }>} `failures`: every page that did
 *   not lead on, such as a dead GreenMotors link (`notFound`) or a stalled HubDrive (`transient`);
 *   the files of every other link are there.
 * @throws {TypeError} For one of `urls` that is not a web URL (a typo, a link `{ url, label }`):
 *   it would be skipped as if the page linked nothing. A URL a gateway page gives is the site's,
 *   and is skipped instead.
 * @throws {unknown} The caller's own reason, as it is, when the caller cancels (`signal`).
 */
export async function scrapeLinks(urls, { domains = {}, onEvent = () => {}, ...options } = {}) {
  for (const url of urls) if (!webUrlOf(url)) throw new TypeError(`Not a web URL: ${url}`);
  // Gateway pages, each read once (a post links some twice), for the link that reaches it first:
  // its files take that link's place.
  const readPages = new Set();
  const found = new Map(); // Files by "host:externalId", with the position of the link that found it first.
  const failures = [];
  const report = (type, url, detail = null) => onEvent({ type, url, detail });
  const fail = (error) => {
    failures.push(error);
    report('failure', error.url, `${error.code}: ${error.message}`);
  };

  // `target`: a URL as given, before it is moved to its current domain. `order`: its position,
  // page by page, so files keep the links' order although pages load at once. `label`: the first
  // label on its way.
  const follow = async (target, order, label = null) => {
    const parsed = webUrlOf(target);
    if (!parsed) return report('skipped', target, 'not a web URL');
    const url = onCurrentDomain(parsed, domains);
    const gateway = gatewayOf(url);
    if (gateway) {
      if (readPages.has(url)) return report('skipped', url, 'page read already');
      if (order.length > MAX_GATEWAYS) return fail(new EngineError('unrecognized', `More than ${MAX_GATEWAYS} gateways in a row`, { url }));
      readPages.add(url);
      let next;
      try {
        ({ links: next } = await retry(() => gateway.expand(url, options)));
      } catch (error) {
        if (!(error instanceof EngineError)) throw error;
        return fail(error);
      }
      report('gateway', url, `${gateway.label}: ${next.length} links`);
      await Promise.all(next.map((link, i) => follow(link.url, [...order, i], label ?? link.label)));
      return;
    }
    const host = hostOf(url)?.id;
    const externalId = externalIdOf(url);
    if (!externalId) return report('skipped', url, host ? 'names no file' : 'no known host');
    const key = `${host}:${externalId}`;
    const known = found.get(key);
    if (known && compareOrder(known.order, order) <= 0) return report('skipped', url, 'file found already');
    found.set(key, { order, file: { host, externalId, url, label } });
    report('file', url, host);
  };

  await Promise.all(urls.map((url, i) => follow(url, [i])));
  const files = [...found.values()].sort((a, b) => compareOrder(a.order, b.order)).map(({ file }) => file);
  return { files, failures };
}

/** Order of two link positions: [2, 0] comes before [2, 1] and before [3]. */
function compareOrder(a, b) {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
}
