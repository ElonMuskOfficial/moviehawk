/**
 * What the engine reads off any page's HTML: its links.
 */

/**
 * @typedef {{ url: string, label: string | null }} Link
 *   `url`: absolute, resolved against the page's address. `label`: the link's text on the page, such
 *   as "720p x264 [850MB]" or "Download HubCloud"; null for a link without text (a logo).
 */

/**
 * @param {import('cheerio').CheerioAPI} $ - The page, loaded with its address as `baseURI`.
 * @param {object} a - One of its `a[href]` elements.
 * @returns {Link}
 */
export function linkOf($, a) {
  return { url: $(a).prop('href'), label: $(a).text().replace(/\s+/g, ' ').trim() || null };
}
