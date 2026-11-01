/**
 * What the engine reads off any page's HTML: an element's text, links, and lines of buttons.
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
 * The heading a button is in, when it shares it with others or with text: a line of buttons, such
 * as "720p – Drive | Instant | WATCH" (HDHub4u's episodes, HUBLinks' pages). Lines are headings;
 * a link in a paragraph is in the page's prose.
 *
 * @param {import('cheerio').CheerioAPI} $
 * @param {object} a - An `a[href]` element.
 * @returns {import('cheerio').Cheerio<any> | null} null for a button alone in its heading
 *   ("720p x264 [850MB]"), which states its file itself, or a link in no heading.
 */
export function lineOf($, a) {
  const line = $(a).closest('h1, h2, h3, h4, h5, h6');
  return line.length > 0 && textOf(line) !== textOf($(a)) ? line : null;
}

/**
 * What a line of buttons starts with, which names what its buttons lead to: "720p – Drive |
 * Instant" starts with "720p" (without the dash after it).
 *
 * @param {import('cheerio').Cheerio<any> | null} line - As lineOf gives it.
 * @returns {string} Empty when the line starts with a button, or there is no line.
 */
export function lineStartOf(line) {
  if (!line) return '';
  return textBefore(line[0], line.find('a[href]')[0]).replace(/\s+/g, ' ').replace(/[\s–-]+$/, '').trim();
}

/** The text of `node` that comes before `stop`, one of its descendants. */
function textBefore(node, stop) {
  let text = '';
  const read = (current) => {
    if (current === stop) return true;
    if (current.type === 'text') text += current.data;
    return (current.children ?? []).some(read);
  };
  read(node);
  return text;
}

/**
 * @param {import('cheerio').CheerioAPI} $ - The page, loaded with its address as `baseURI`.
 * @param {object} a - One of its `a[href]` elements.
 * @param {string} [file] - What the page says of the link's file, for a button that names only its
 *   server: the label is then "<file> · <the button's text>", "EPiSODE 1 720p · Drive".
 * @param {string} [button] - The button's name, when its text does not say it (a provider's own
 *   reading); its text by default.
 * @returns {Link}
 */
export function linkOf($, a, file = '', button = textOf($(a))) {
  return { url: $(a).prop('href'), label: [file, button].filter(Boolean).join(' · ') || null };
}
