/**
 * The file hosts the engine recognizes, and how a host's URL names a file (its `externalId`). A
 * host is matched by a label of the URL's hostname (urls.js).
 */
import { EngineError } from '../errors.js';
import { hasLabel, webUrlOf } from '../urls.js';
import { resolveHubCloud, scrapeHubCloud } from './hubcloud.js';

// A file id is a plain token of letters, digits, _ and -. HubCloud shows a deleted file's search
// page at "/drive/search-recover.php", which has the shape of a file URL but names no file.
const FILE_ID = /^[\w-]+$/;

const fileId = (value) => (value && FILE_ID.test(value) ? value : null);

// The id in a path "/<prefix>/<id>" (a trailing slash allowed), for any of `prefixes`.
const pathId = (...prefixes) => (url) => {
  const segments = url.pathname.split('/').filter(Boolean);
  return segments.length === 2 && prefixes.includes(segments[0]) ? fileId(segments[1]) : null;
};

// Each host's id is also the hostname label that identifies it. Shapes seen on live posts
// (2026-10-31, 37 posts across both sites' catalogs, and the 206,598 HubCloud files stored by then).
// `scrapeFile`: the reader of the host's file page, for a host whose page states the file's name
// and size. `resolve`: the reader of its download servers, for a host a consumer needs resolved.
const HOSTS = [
  { id: 'hubcloud', externalId: pathId('drive', 'video'), scrapeFile: scrapeHubCloud, resolve: resolveHubCloud },
  { id: 'hubcdn', externalId: pathId('file') },
  // Older posts link "gofile.io/?c=<id>".
  { id: 'gofile', externalId: (url) => pathId('d')(url) ?? (url.pathname === '/' ? fileId(url.searchParams.get('c')) : null) },
  { id: 'hdstream4u', externalId: pathId('file') },
  { id: 'hubstream', externalId: (url) => fileId(url.hash.slice(1)) },
  { id: 'vidaraa', externalId: pathId('e') },
  // A player of IMDb's titles: it names no file, so its id is the title's, season's and episode's
  // ("/series/tt29625288/s-01/ep-01").
  { id: 'play4u', externalId: (url) => /^\/series\/(tt\d+\/s-\d+(?:\/ep-\d+)?)\/?$/.exec(url.pathname)?.[1] ?? null },
  // Its player ("/player.php/?v=<id>") and its download page ("/view/<id>") name the same file.
  { id: 'multicloudlinks', externalId: (url) => pathId('view')(url) ?? (/^\/player\.php\/?$/.test(url.pathname) ? fileId(url.searchParams.get('v')) : null) },
];

/**
 * @param {string} url
 * @returns {{ host: typeof HOSTS[number], parsed: URL } | null}
 */
function findHost(url) {
  const parsed = webUrlOf(url);
  const host = parsed && HOSTS.find(({ id }) => hasLabel(parsed, id));
  return host ? { host, parsed } : null;
}

/**
 * The host a URL is on: "https://hubcloud.foo/drive/abc" → "hubcloud".
 *
 * @param {string} url
 * @returns {string | null} null when the URL is on no host the engine knows, or is not a web URL.
 */
export function hostOf(url) {
  return findHost(url)?.host.id ?? null;
}

/**
 * The host's own id of the file a URL names: "https://hubcloud.foo/drive/abc" → "abc". The same
 * file on another domain has the same id.
 *
 * @param {string} url
 * @returns {string | null} null when the URL names no file (HubCloud's search page, the
 *   "hubcdn.wiki/embed" placeholder) or is on no host the engine knows.
 */
export function externalIdOf(url) {
  const found = findHost(url);
  return found ? found.host.externalId(found.parsed) : null;
}

/**
 * Reads a file's page on its host: the file's name and size, as the page states them.
 *
 * @param {string} url - On the host's current domain.
 * @param {import('../http.js').RequestOptions} [options]
 * @returns {Promise<{ filename: string, sizeBytes: number }>}
 * @throws {EngineError} `unsupported` for a URL on a host whose page the engine does not read, and
 *   the host reader's errors.
 */
export async function scrapeFile(url, options) {
  const read = findHost(url)?.host.scrapeFile;
  if (!read) throw new EngineError('unsupported', 'The engine does not read file pages of this host', { url });
  return read(url, options);
}

/**
 * One way to download a file, as the host's download page offers it.
 *
 * @typedef {{ server: string, kind: 'direct' | 'page', url: string, label: string }} Download
 *   `server`: which server ("10gbps", "fsl", ...; "other" for one the engine does not know).
 *   `kind`: `direct` when `url` answers with the file itself, `page` when it is a page that leads
 *   to it. `label`: the button's text, such as "Download Part 2 [ZipDisk Server]".
 */

/**
 * Resolves a file into its downloads: the file's page, its download page, and the redirects to
 * the file. Downloads expire within minutes or hours; scrapeFile's answer does not.
 *
 * @param {string} url - On the host's current domain.
 * @param {import('../http.js').RequestOptions} [options]
 * @returns {Promise<{ filename: string, sizeBytes: number, downloads: Download[] }>}
 * @throws {EngineError} `unsupported` for a URL on a host the engine does not resolve, and the host
 *   resolver's errors.
 */
export async function resolve(url, options) {
  const read = findHost(url)?.host.resolve;
  if (!read) throw new EngineError('unsupported', 'The engine does not resolve files of this host', { url });
  return read(url, options);
}
