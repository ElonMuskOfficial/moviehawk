/**
 * What the engine reads off any page's HTML: an element's text, and links.
 */

/**
 * @typedef {{ url: string, label: string | null }} Link
 *   `url`: absolute, resolved against the page's address. `label`: what the page says the link is,
 *   such as "720p x264 [850MB]" or "Download HubCloud"; null for a link without text (a logo).
 */

/**
 * @param {import('cheerio').Cheerio<any>} element
 * @returns {string} Its text as it reads on the page: runs of whitespace (line breaks, &nbsp;) are
 *   one space.
 */
export function textOf(element) {
  return element.text().replace(/\s+/g, ' ').trim();
}

/**
 * @param {import('cheerio').CheerioAPI} $ - The page, loaded with its address as `baseURI`.
 * @param {object} a - One of its `a[href]` elements.
 * @param {string} [file] - What the page says of the link's file, for a button that names only its
 *   server: the label is then "<file> · <the button's text>", "EPiSODE 1 720p · Drive".
 * @returns {Link}
 */
export function linkOf($, a, file = '') {
  return { url: $(a).prop('href'), label: [file, textOf($(a))].filter(Boolean).join(' · ') || null };
}
