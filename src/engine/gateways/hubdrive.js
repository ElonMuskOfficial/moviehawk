/**
 * HubDrive pages: a file page (hubdrive.bar/file/<id>) leads to its servers' links (HubCloud,
 * Telegram); a pack page (hubdrive.bar/packs/<id>) leads to the file pages of a season zip and of
 * each episode.
 */
import * as cheerio from 'cheerio';
import { EngineError } from '../errors.js';
import { linkOf, textOf } from '../html.js';
import { fetchHtml } from '../http.js';

// HubDrive answers a deleted file with HTTP 200 and one of these headings (live, 2026-10-29 and
// 2026-10-31).
const DELETED = /^(?:File not found|The file has been deleted)\b/i;

/**
 * Reads one HubDrive page and returns where it leads, in page order.
 *
 * @param {string} url - On HubDrive's current domain (older posts link hubdrive.live, which is gone).
 * @param {import('../http.js').RequestOptions} [options]
 * @returns {Promise<{ links: import('../html.js').Link[], title?: string | null, tags?: string[], sections?: import('./hublinks.js').LinkGroup[] }>}
 *   A file page: its server buttons; none when the file has no server (an answer, not a failure).
 *   A pack page: its rows' file pages, each labelled by its file's name; its name and its header's
 *   tags; and the pack as one group, a line per file with its size as its tag.
 * @throws {EngineError} `notFound` for HubDrive's deleted page; `unrecognized` for a file page
 *   without the file's details (a challenge page) or a pack without rows; and fetchHtml's errors.
 */
export async function expandHubDrive(url, options) {
  const page = await fetchHtml(url, options);
  const $ = cheerio.load(page.html, { baseURI: page.url });
  if ($('h1, h2, h3, h4, h5, h6').toArray().some((heading) => DELETED.test(textOf($(heading))))) {
    throw new EngineError('notFound', 'HubDrive says the file is gone', { url });
  }
  const linksOf = (selector) => $(selector).toArray().map((a) => linkOf($, a));

  if (new URL(page.url).pathname.startsWith('/packs/')) {
    // A row's link is an icon: its file is named by the row's title ("…S01E01….mkv"), and its size
    // is the row's own (".pack-clean-size": "7.04 GB"), each read by its class. Without them, every
    // row would take the label of its file page's server button. The pack is one group, a line per
    // file, as HUBLinks' groups. The page's header names the pack (".pack-clean-name": "Lupin - S04
    // 1080p WEB-DL Packs") and states its files and size (".pack-clean-meta-item": "Includes 9
    // files", "Total Size: 23.61 GB"), as its tags (live, 2026-11-02: 2 of 2 packs).
    const lines = $('.pack-clean-file a.pack-clean-link').toArray().map((a) => {
      const row = $(a).closest('.pack-clean-file');
      const title = textOf(row.find('.pack-clean-title').first()) || null;
      const size = textOf(row.find('.pack-clean-size').first());
      return { title, links: [linkOf($, a, '', title ?? undefined)], tags: [size].filter(Boolean) };
    });
    if (lines.length === 0) throw new EngineError('unrecognized', 'No files on the HubDrive pack page', { url });
    const title = textOf($('.pack-clean-name').first()) || null;
    const tags = $('.pack-clean-meta-item').toArray().map((item) => textOf($(item))).filter(Boolean);
    return { links: lines.flatMap((line) => line.links), title, tags, sections: [{ title: null, lines }] };
  }
  // A real file page states the file's size; a challenge page has a title but no details.
  if (!$('tr').toArray().some((row) => /File Size/i.test($(row).text()))) {
    throw new EngineError('unrecognized', 'No file details on the HubDrive file page', { url });
  }
  // Each server is a button inside a heading ("[HubCloud Server]", "Telegram File"). The card's
  // other links are an ad and "Copy Link".
  return { links: linksOf('.card-body :is(h1, h2, h3, h4, h5, h6) a[href]') };
}
