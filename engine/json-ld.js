/**
 * The JSON-LD of a page: the structured data a site states about the page, in
 * <script type="application/ld+json">. HDHub4u and 4KHDHub give one object per script (live,
 * 2026-10-31: 42 of 42 posts).
 */

/**
 * @param {import('cheerio').CheerioAPI} $
 * @param {string[]} types - such as ["Movie", "TVSeries"]
 * @returns {Record<string, any> | null} The first object of one of `types`. A script that is not
 *   JSON states nothing, as for a browser, and does not hide the page's other scripts.
 */
export function jsonLdOf($, types) {
  return $('script[type="application/ld+json"]').toArray()
    .map((script) => jsonOf($(script).html()))
    .find((node) => types.includes(node?.['@type'])) ?? null;
}

/** @returns {unknown} The JSON in `text`, or null when it is not JSON. */
function jsonOf(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
