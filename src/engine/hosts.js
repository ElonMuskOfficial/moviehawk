/**
 * The file hosts the engine recognizes, and how a host's URL names a file (its `externalId`).
 *
 * A host is matched by a label of the URL's hostname, never by a substring of the URL:
 * "https://t.me/hubcloudreport" is not HubCloud. A label, not a whole domain, because the domains
 * rotate (hubcloud.ist, hubcloud.foo, dl.hubcloud.link, ...) while the label stays.
 */

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
// (2026-10-31, 37 posts across both sites' catalogs, and the 206,000 HubCloud files stored by then).
const HOSTS = [
  { id: 'hubcloud', externalId: pathId('drive', 'video') },
  { id: 'hubcdn', externalId: pathId('file') },
  // Older posts link "gofile.io/?c=<id>".
  { id: 'gofile', externalId: (url) => pathId('d')(url) ?? (url.pathname === '/' ? fileId(url.searchParams.get('c')) : null) },
  { id: 'hdstream4u', externalId: pathId('file') },
  { id: 'hubstream', externalId: (url) => fileId(url.hash.slice(1)) },
  // Its player ("/player.php/?v=<id>") and its download page ("/view/<id>") name the same file.
  { id: 'multicloudlinks', externalId: (url) => pathId('view')(url) ?? (/^\/player\.php\/?$/.test(url.pathname) ? fileId(url.searchParams.get('v')) : null) },
];

/**
 * @param {string} url
 * @returns {{ host: typeof HOSTS[number], parsed: URL } | null}
 */
function findHost(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null; // Pages link all kinds of text; one that is not a URL is on no host.
  }
  // Only web links: the sites have typos such as "hhttps://hubcloud.ist/...".
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  const labels = parsed.hostname.split('.');
  const host = HOSTS.find(({ id }) => labels.includes(id));
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
