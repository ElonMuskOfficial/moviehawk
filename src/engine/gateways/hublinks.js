/**
 * HUBLinks archive pages (hblinks.lol/archives/<id>): the hosts of one file, or of several (an
 * episode's "480p – Drive | Instant | Direct" lines), behind HDHub4u's buttons.
 */
import * as cheerio from 'cheerio';
import { EngineError } from '../errors.js';
import { linkOf } from '../html.js';
import { fetchHtml } from '../http.js';

// The archive's own content. The rest of the page is the site's navigation.
const CONTENT = '.entry-content';

/**
 * Reads one HUBLinks archive page and returns every link in its content, in page order, as the page
 * gives them: hosts, gateways, hosts the engine does not know, a torrent. A removed page, a
 * torrent-only page or a page without links leads nowhere (`links: []`), which is an answer, not a
 * failure.
 *
 * @param {string} url - On HUBLinks' current domain (older posts link hblinks.pro, which is gone).
 * @param {import('../http.js').RequestOptions} [options]
 * @returns {Promise<{ links: import('../html.js').Link[] }>}
 * @throws {EngineError} `unrecognized` for a page without the content area (live, 2026-10-31: every
 *   archive page has one, removed ones too), and fetchHtml's errors (`notFound` on HTTP 404).
 */
export async function expandHubLinks(url, options) {
  const page = await fetchHtml(url, options);
  const $ = cheerio.load(page.html, { baseURI: page.url });
  const content = $(CONTENT).first();
  // Without it every page would seem to lead nowhere, as if all its files were gone.
  if (content.length === 0) throw new EngineError('unrecognized', 'No content area on the HUBLinks page', { url });
  return { links: content.find('a[href]').toArray().map((a) => linkOf($, a)) };
}
