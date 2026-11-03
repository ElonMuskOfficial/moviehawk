/**
 * V-Cloud's older link page (vcloud.beer/api/index.php?link=<...>, "VegasCloud API"), behind the
 * 2021–22 NexDrive pages' "V-Cloud [Resumable]" and "G-Drive [No Login]" buttons: one button,
 * "Direct Download [Resume]", to the file's V-Cloud page on its older domain, "vcloud.zip/<id>",
 * whose id is the same on vcloud.beer (live, 2026-11-03: 21 of 21 pages).
 */
import * as cheerio from 'cheerio';
import { EngineError } from '../errors.js';
import { linkOf } from '../html.js';
import { fetchHtml } from '../http.js';

/**
 * Reads one V-Cloud link page and returns where it leads.
 *
 * @param {string} url - On V-Cloud's current domain.
 * @param {import('../http.js').RequestOptions} [options]
 * @returns {Promise<{ links: import('../html.js').Link[] }>} Its button; none when the page has
 *   none (an answer, not a failure). A page that leads to one place: no title, tags or groups.
 * @throws {EngineError} `unrecognized` for a page without its card (a challenge page, a changed
 *   layout); and fetchHtml's errors.
 */
export async function expandVCloud(url, options) {
  const page = await fetchHtml(url, options);
  const $ = cheerio.load(page.html, { baseURI: page.url });
  const card = $('.card-body').first();
  if (card.length === 0) throw new EngineError('unrecognized', 'No card on the V-Cloud link page', { url });
  return { links: card.find('a.btn[href]').toArray().filter((a) => $(a).attr('href').trim()).map((a) => linkOf($, a)) };
}
