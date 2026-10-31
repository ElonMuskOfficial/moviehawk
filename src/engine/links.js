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
 * once). A link that is neither a gateway nor a file on a known host is skipped. Every URL is moved
 * to its site's current domain before it is read, files too.
 *
 * @param {import('./html.js').Link[]} links - A post's links as scrapePost gives them, all or some.
 * @param {import('./http.js').RequestOptions & {
 *   domains?: Record<string, string>,
 *   onEvent?: (event: EngineEvent) => void,
 * }} [options] `domains`: as for onCurrentDomain (urls.js). `onEvent`: what happened to each link,
 *   for logs.
 * @returns {Promise<{ files: HostFile[], failures: EngineError[] }>} `failures`: every page that did
 *   not lead on, such as a dead GreenMotors link (`notFound`) or a stalled HubDrive (`transient`);
 *   the files of every other link are there.
 * @throws {TypeError} For a link that is not `{ url, label }`, such as a bare URL string: it would
 *   be skipped as if the page linked nothing.
 * @throws {unknown} The caller's own reason, as it is, when the caller cancels (`signal`).
 */
export async function scrapeLinks(links, { domains = {}, onEvent = () => {}, ...options } = {}) {
  const notLink = links.find((link) => typeof link?.url !== 'string');
  if (notLink !== undefined) throw new TypeError(`Not a link { url, label }: ${JSON.stringify(notLink)}`);
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

  // `order`: the link's position, page by page, so files keep the links' order although pages load
  // at once.
  const follow = async (link, order) => {
    const parsed = webUrlOf(link.url);
    if (!parsed) return report('skipped', link.url, 'not a web URL');
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
      await Promise.all(next.map((nextLink, i) => follow(nextLink, [...order, i])));
      return;
    }
    const host = hostOf(url)?.id;
    const externalId = externalIdOf(url);
    if (!externalId) return report('skipped', url, host ? 'names no file' : 'no known host');
    const key = `${host}:${externalId}`;
    const known = found.get(key);
    if (known && compareOrder(known.order, order) <= 0) return report('skipped', url, 'file found already');
    found.set(key, { order, file: { host, externalId, url } });
    report('file', url, host);
  };

  await Promise.all(links.map((link, i) => follow(link, [i])));
  const files = [...found.values()].sort((a, b) => compareOrder(a.order, b.order)).map(({ file }) => file);
  return { files, failures };
}

/** Order of two link positions: [2, 0] comes before [2, 1] and before [3]. */
function compareOrder(a, b) {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
}
