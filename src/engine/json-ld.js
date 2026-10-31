/**
 * The JSON-LD of a page: the structured data a site states about the page, in
 * <script type="application/ld+json">. HDHub4u and 4KHDHub give one object per script (live,
 * 2026-10-31: 42 of 42 posts).
 */

/**
 * @param {import('cheerio').CheerioAPI} $
 * @param {string[]} types - such as ["Movie", "TVSeries"]
 * @returns {Record<string, any> | null} The first object of one of `types`.
 */
export function jsonLdOf($, types) {
  return $('script[type="application/ld+json"]').toArray()
    .map((script) => JSON.parse($(script).html()))
    .find((node) => types.includes(node['@type'])) ?? null;
}
