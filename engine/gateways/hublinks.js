/**
 * HUBLinks archive pages (hblinks.lol/archives/<id>): the hosts of one file, or of several (an
 * episode's "480p – Drive | Instant | Direct" lines), behind HDHub4u's buttons.
 */
import * as cheerio from 'cheerio';
import { EngineError } from '../errors.js';
import { lineStartOf, linkOf, textOf } from '../html.js';
import { fetchHtml } from '../http.js';

/**
 * @typedef {{ title: string | null, lines: LinkLine[] }} LinkGroup
 *   A group of the page's links, between two <hr>: its title where it has one ("Watch Online").
 * @typedef {{ title: string | null, links: import('../html.js').Link[], tags: string[] }} LinkLine
 *   A line of a page of files (HUBLinks, a HubDrive pack): its title, its text before its first link
 *   ("480p"), or its link's own text, a file's name; its tags, what the page states of its file
 *   beside it ("7.04 GB": a pack's), [] where it states none (HUBLinks).
 */

// The archive's own content. The rest of the page is the site's navigation.
const CONTENT = '.entry-content';
// The blocks a link's line is: a heading, a paragraph, a list item, or a div with no block in it.
const BLOCK = 'h1, h2, h3, h4, h5, h6, p, li, div';

/**
 * Reads one HUBLinks archive page and returns all it states, as it states it: every link in its
 * content, in page order (hosts, gateways, hosts the engine does not know, a torrent), its title,
 * and the groups it puts them in. Which to show is the caller's. A removed page, a torrent-only
 * page or a page without links leads nowhere (`links: []`), which is an answer, not a failure.
 *
 * @param {string} url - On HUBLinks' current domain (older posts link hblinks.pro, which is gone).
 * @param {import('../http.js').RequestOptions} [options]
 * @returns {Promise<{ links: import('../html.js').Link[], title: string | null, tags: string[], sections: LinkGroup[] }>}
 *   `links`: every link of `sections`, in one list, as every gateway gives them; each labelled by
 *   its own text ("Drive"; what it is for is its line's title, "480p").
 *   `title`: the page's `<title>`, as it is: the only place it names the file
 *   ("Killing Them Softly (2012) 480p – HUBLinks"; the page's `h1` is its menu).
 *   `sections`: the links in the page's groups and lines (sectionsOf).
 * @throws {EngineError} `unrecognized` for a page without the content area (live, 2026-10-31: every
 *   archive page has one, removed ones too), and fetchHtml's errors (`notFound` on HTTP 404).
 */
export async function expandHubLinks(url, options) {
  const page = await fetchHtml(url, options);
  const $ = cheerio.load(page.html, { baseURI: page.url });
  const content = $(CONTENT).first();
  // Without it every page would seem to lead nowhere, as if all its files were gone.
  if (content.length === 0) throw new EngineError('unrecognized', 'No content area on the HUBLinks page', { url });
  const sections = sectionsOf($, content);
  return {
    links: sections.flatMap(({ lines }) => lines.flatMap((line) => line.links)),
    title: textOf($('title').first()) || null,
    tags: [],
    sections,
  };
}

/**
 * The content's links, in the page's groups. Every page splits its content with `<hr>` (live,
 * 2026-11-02: 136 of 136 pages): a note, the main servers, the mirrors, "Watch Online", the footer.
 * A group's title is its first block with text and no link, before its first link ("Watch Online",
 * "More Direct links"; 68 of 369 groups with links have one). A line is the block its links are in:
 * a server alone in its heading ("Instant⚡Download"), an episode's quality ("480p – Drive |
 * Instant | Direct"), a paragraph of mirrors whose text is their URL, a logo; a link in no block is a
 * line of its own. Nothing is read from words. A group without links (the note, the footer) is left
 * out; every link is in one line, once, in page order.
 *
 * @returns {LinkGroup[]} A line's title: its text before its first link ("480p"), or, for one link
 *   alone in its block, its text (null for a logo); a link's label: its own text, or null.
 */
function sectionsOf($, content) {
  const sections = [];
  let section = { title: null, lines: [] };
  let lineBlock = null;
  // A leaf block: one with no block in it. A wrapper is not a line.
  const isLeaf = (element) => $(element).find(BLOCK).length === 0;
  // The block a link is in, looked for up to the content and no further; null for a wrapper.
  const blockOf = (element) => {
    const block = $(element).parentsUntil(content).filter(BLOCK).first();
    return block.length > 0 && isLeaf(block[0]) ? block : null;
  };
  for (const element of content.find(`hr, a[href], ${BLOCK}`).toArray()) {
    if (element.tagName === 'hr') {
      sections.push(section);
      section = { title: null, lines: [] };
      lineBlock = null;
    } else if (element.tagName === 'a') {
      const block = blockOf(element);
      if (block && lineBlock === block[0]) {
        section.lines.at(-1).links.push(linkOf($, element));
        continue;
      }
      lineBlock = block?.[0] ?? null;
      const alone = !block || (block.find('a[href]').length === 1 && textOf(block) === textOf($(element)));
      section.lines.push({ title: (alone ? textOf($(element)) : lineStartOf(block)) || null, links: [linkOf($, element)], tags: [] });
    } else if (section.title === null && section.lines.length === 0 && isLeaf(element) && $(element).find('a[href]').length === 0) {
      // A leaf block of text alone, before the group's first link: its title.
      section.title = textOf($(element)) || null;
    }
  }
  sections.push(section);
  return sections.filter(({ lines }) => lines.length > 0);
}
