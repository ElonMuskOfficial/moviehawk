/**
 * Resource names (docs/api.md, Names): what a client sends back, made from the sites' URLs.
 */

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
 * the URL back from the name alone (docs/api.md, Names).
 *
 * @param {string} url
 */
export function linkName(url) {
  return `links/${Buffer.from(url).toString('base64url')}`;
}
