/**
 * A post and every file it leads to: the post page is read by its provider, and each of its links
 * is followed through the gateways until it reaches a host.
 */
import { EngineError } from './errors.js';
import { gatewayOf } from './gateways/index.js';
import { externalIdOf, hostOf } from './hosts/index.js';
import { retry } from './http.js';
import { providerOf } from './providers/index.js';
import { hasLabel, webUrlOf } from './urls.js';

// Gateways in a row a link may pass before the engine stops following it, so a gateway that
// leads to itself under new URLs cannot keep it busy. Live, a link passes at most 3
// (GreenMotors → HUBLinks → HubDrive → HubCloud, 2026-10-31: 1,122 pages of 14 posts).
const MAX_GATEWAYS = 5;
// Pages requested at once for one post: a series links up to 280 buttons, which the gateways
// would answer with stalls and HTTP 429 if they all came at once.
const CONCURRENCY = 6;

/**
 * @typedef {{ host: string, externalId: string, url: string, statedLanguages: string | null }} HostFile
 *   `statedLanguages`: the languages the post states for the link that led to the file.
 * @typedef {{ type: 'gateway' | 'file' | 'skipped' | 'failure', url: string, detail: string | null }} EngineEvent
 */

/**
 * Reads a post page and follows its links to the files they lead to: every file once (found by
 * its host and externalId), in page order, each with the languages the post states for its link.
 * A link that is neither a gateway nor a file on a known host is skipped.
 *
 * Every URL is moved to its site's current domain before it is read: posts keep linking domains
 * that no longer answer (hblinks.pro, hubdrive.live, hubcloud.foo).
 *
 * @param {string} url - A post page.
 * @param {import('./http.js').RequestOptions & {
 *   domains?: Record<string, string>,
 *   onEvent?: (event: EngineEvent) => void,
 * }} [options] `domains`: the current domain of each site whose domain rotates, by its label
 *   ({ hblinks: 'https://hblinks.lol' }). `onEvent`: what happened to each link, for logs.
 * @returns {Promise<{ post: import('./providers/index.js').Post, files: HostFile[], linkCount: number,
 *   failures: EngineError[] }>} `linkCount`: the post's links to a gateway or a known host (0 can be
 *   a glitch of the site). `failures`: every page that did not lead on, such as a dead GreenMotors
 *   link (`notFound`) or a stalled HubDrive (`transient`); the files of every other link are there.
 * @throws {EngineError} `unsupported` for a URL on no site the engine reads, and the provider's
 *   errors for the post page itself (after retry).
 * @throws {TypeError} For a string that is not a web URL.
 * @throws {unknown} The caller's own reason, as it is, when the caller cancels (`signal`).
 */
export async function scrapePost(url, { domains = {}, onEvent = () => {}, ...options } = {}) {
  const postUrl = webUrlOf(url);
  if (!postUrl) throw new TypeError(`Not a web URL: ${url}`);
  const provider = providerOf(postUrl.href);
  if (!provider) throw new EngineError('unsupported', 'The engine does not read posts of this site', { url });
  const { post, links } = await retry(() => provider.post(onCurrentDomain(postUrl, domains), options));

  const limit = createLimiter(CONCURRENCY);
  const opened = new Set(); // Gateway pages, each read once: a post links some twice.
  const found = new Map(); // Files by "host:externalId", with the position of the link that found it first.
  const failures = [];
  const report = (type, eventUrl, detail = null) => onEvent({ type, url: eventUrl, detail });

  // `order`: the link's position, page by page, so files keep page order although pages load at once.
  const follow = async (link, order, statedLanguages) => {
    const parsed = webUrlOf(link);
    if (!parsed) return report('skipped', link, 'not a web URL');
    const linkUrl = onCurrentDomain(parsed, domains);
    const expand = gatewayOf(linkUrl);
    if (expand) {
      if (opened.has(linkUrl)) return report('skipped', linkUrl, 'read already');
      if (order.length > MAX_GATEWAYS) {
        const error = new EngineError('unrecognized', `More than ${MAX_GATEWAYS} gateways in a row`, { url: linkUrl });
        failures.push(error);
        return report('failure', linkUrl, error.message);
      }
      opened.add(linkUrl);
      let next;
      try {
        ({ links: next } = await limit(() => retry(() => expand(linkUrl, options))));
      } catch (error) {
        if (!(error instanceof EngineError)) throw error;
        failures.push(error);
        return report('failure', linkUrl, `${error.code}: ${error.message}`);
      }
      report('gateway', linkUrl, `${next.length} links`);
      await Promise.all(next.map((nextLink, i) => follow(nextLink, [...order, i], statedLanguages)));
      return;
    }
    const host = hostOf(linkUrl);
    const externalId = externalIdOf(linkUrl);
    if (!externalId) return report('skipped', linkUrl, host ? 'names no file' : 'no known host');
    const key = `${host}:${externalId}`;
    const known = found.get(key);
    if (known && compareOrder(known.order, order) <= 0) return report('skipped', linkUrl, 'file found already');
    found.set(key, { order, file: { host, externalId, url: linkUrl, statedLanguages } });
    report('file', linkUrl, host);
  };

  const linkCount = links.filter((link) => gatewayOf(link.url) || hostOf(link.url)).length;
  await Promise.all(links.map((link, i) => follow(link.url, [i], link.statedLanguages)));

  const files = [...found.values()].sort((a, b) => compareOrder(a.order, b.order)).map(({ file }) => file);
  return { post, files, linkCount, failures };
}

/**
 * Moves a URL to the current domain of its site, when `domains` names one for a label of it.
 *
 * @param {URL} url
 * @param {Record<string, string>} domains
 * @returns {string}
 */
function onCurrentDomain(url, domains) {
  const label = Object.keys(domains).find((key) => hasLabel(url, key));
  if (!label) return url.href;
  const current = new URL(domains[label]);
  const moved = new URL(url);
  moved.protocol = current.protocol;
  moved.host = current.host;
  return moved.href;
}

/** Page order of two link positions: [2, 0] comes before [2, 1] and before [3]. */
function compareOrder(a, b) {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
}

/**
 * Runs at most `max` of the functions given to it at once; the others wait their turn.
 *
 * @param {number} max
 * @returns {<T>(fn: () => Promise<T>) => Promise<T>}
 */
function createLimiter(max) {
  let active = 0;
  const waiting = [];
  const next = () => {
    if (active >= max || waiting.length === 0) return;
    active++;
    const { fn, resolve, reject } = waiting.shift();
    fn().then(resolve, reject).finally(() => {
      active--;
      next();
    });
  };
  return (fn) => new Promise((resolve, reject) => {
    waiting.push({ fn, resolve, reject });
    next();
  });
}
