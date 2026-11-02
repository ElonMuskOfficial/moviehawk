/**
 * Resource names (README.md, Names): what a client sends back, made from the sites' URLs; and a
 * link as every answer gives it.
 */
import { identify } from '../engine/index.js';

/**
 * A post's name: "https://new10.hdhub4u.cl/akka-season-1-hindi-webrip-full-series/" is
 * "sites/hdhub4u/posts/akka-season-1-hindi-webrip-full-series". The slug is decoded
 * ("wall%c2%b7e-2008-..." is "wall·e-2008-..."): a client encodes it in a URL as any path, and the
 * router decodes it again.
 *
 * @param {string} site - The engine's provider, "hdhub4u".
 * @param {string} url - The post's URL: one path segment on every site (live, 2026-11-01).
 */
export function postName(site, url) {
  const slug = decodeURIComponent(new URL(url).pathname.replace(/^\/|\/$/g, ''));
  return `sites/${site}/posts/${slug}`;
}

/**
 * A post's URL, back from the slug of its name: "wall·e-2008-..." is
 * "https://new10.hdhub4u.cl/wall%C2%B7e-2008-.../", which opens the post as the site's own
 * "wall%c2%b7e-..." does (live, 2026-11-01).
 *
 * @param {string} siteUrl - The site's current domain, "https://new10.hdhub4u.cl".
 * @param {string} slug - Decoded, as the router gives it.
 */
export function postUrl(siteUrl, slug) {
  return `${siteUrl}/${encodeURIComponent(slug)}/`;
}

/**
 * A link's name: its URL, as the post gives it, base64url-encoded (RFC 4648 §5), so the API reads
 * the URL back from the name alone (README.md, Names).
 *
 * @param {string} url
 */
export function linkName(url) {
  return `links/${Buffer.from(url).toString('base64url')}`;
}

/**
 * The site a link is on, as the client shows it: the engine's id of its gateway or host
 * ("hubcloud"), or its hostname for one the engine does not know ("megaup.net"). Never null: every
 * link is on some site.
 *
 * @param {string} url - A web URL.
 */
export function linkHost(url) {
  return identify(url)?.id ?? new URL(url).hostname.replace(/^www\./, '');
}

/**
 * A link as every answer gives it (GetPost's lines, GetLink's pages): its name, URL, label and host.
 *
 * @param {{ url: string, label: string | null }} link - As the engine gives it; a web URL.
 */
export function namedLink({ url, label }) {
  return { name: linkName(url), url, label, host: linkHost(url) };
}

/**
 * The URL back from the id of a link's name.
 *
 * @param {string} id - The base64url part, as the router gives it.
 * @returns {string | null} null when it is not of a web URL: the engine takes no other.
 */
export function urlOfId(id) {
  const text = Buffer.from(id, 'base64url').toString();
  return isWebUrl(text) ? text : null;
}

/**
 * @param {string} text
 * @returns {boolean} Whether it is a web (http or https) URL: the only links the API names.
 */
export function isWebUrl(text) {
  try {
    const { protocol } = new URL(text);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}
