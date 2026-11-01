/**
 * The file hosts the engine recognizes, and how a host's URL names a file (its `externalId`). A
 * host is matched by a label of the URL's hostname (urls.js).
 */
import { hasLabel, webUrlOf } from '../urls.js';
import { resolveHubCloud } from './hubcloud.js';

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
// (2026-10-31, 37 posts across both sites' catalogs).
// `resolve`: the reader of the host's download servers, for a host a consumer needs resolved.
const HOSTS = [
  { id: 'hubcloud', externalId: pathId('drive', 'video'), resolve: resolveHubCloud },
  { id: 'hubcdn', externalId: pathId('file') },
  // Older posts link "gofile.io/?c=<id>".
  { id: 'gofile', externalId: (url) => pathId('d')(url) ?? (url.pathname === '/' ? fileId(url.searchParams.get('c')) : null) },
  { id: 'hdstream4u', externalId: pathId('file') },
  { id: 'hubstream', externalId: (url) => fileId(url.hash.slice(1)) },
  { id: 'vidaraa', externalId: pathId('e') },
  // Its page ("/v/<id>/<file name>") and its player ("/e/<id>") name the same file. strtape.tech
  // seen live (2026-11-01), behind a GreenMotors WATCH link of an HDHub4u series.
  {
    id: 'streamtape',
    labels: ['streamtape', 'strtape'],
    externalId: (url) => {
      const segments = url.pathname.split('/').filter(Boolean);
      return ['v', 'e'].includes(segments[0]) && (segments.length === 2 || segments.length === 3) ? fileId(segments[1]) : null;
    },
  },
  // A player of IMDb's titles: it names no file, so its id is the title's, season's and episode's
  // ("/series/tt29625288/s-01/ep-01").
  { id: 'play4u', externalId: (url) => /^\/series\/(tt\d+\/s-\d+(?:\/ep-\d+)?)\/?$/.exec(url.pathname)?.[1] ?? null },
  // Its player ("/player.php/?v=<id>") and its download page ("/view/<id>") name the same file.
  { id: 'multicloudlinks', externalId: (url) => pathId('view')(url) ?? (/^\/player\.php\/?$/.test(url.pathname) ? fileId(url.searchParams.get('v')) : null) },
];

/**
 * The host a URL is on: "https://hubcloud.foo/drive/abc" → HubCloud, whose `id` is "hubcloud".
 *
 * @param {string} url
 * @returns {typeof HOSTS[number] | null} null when the URL is on no host the engine knows, or is
 *   not a web URL.
 */
export function hostOf(url) {
  const parsed = webUrlOf(url);
  return (parsed && HOSTS.find(({ id, labels = [id] }) => labels.some((label) => hasLabel(parsed, label)))) ?? null;
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
  return hostOf(url)?.externalId(new URL(url)) ?? null;
}

/**
 * One file on a host, as a link names it. (Not `File`: Node has a global of that name.)
 *
 * @typedef {{ host: string, externalId: string, url: string, label: string | null }} HostFile
 *   `label`: what the pages on the way to the file say of it, from the one nearest the post
 *   ("480p · Drive"); null when none says anything (a link straight to the file).
 */

/**
 * One way to download a file, as the host's download page offers it.
 *
 * @typedef {{ server: string, kind: 'direct' | 'page', url: string, label: string }} Download
 *   `server`: which server ("10gbps", "fsl", ...; "other" for one the engine does not know).
 *   `kind`: `direct` when `url` answers with the file itself, `page` when it is a page that leads
 *   to it. `label`: the button's text, such as "Download Part 2 [ZipDisk Server]".
 */
