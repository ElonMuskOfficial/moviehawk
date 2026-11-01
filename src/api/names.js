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
