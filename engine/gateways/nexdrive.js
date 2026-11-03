/**
 * NexDrive's pages (nexdrive.beer/genxfm<n>/), behind every download button of Vegamovies and
 * RogMovies (live, 2026-11-03: 590 buttons of 168 posts, 2020 to 2026): the servers of one file
 * ("G-Direct", "V-Cloud", "V-Drive", "GDToT", "Filepress", ...), or of each episode of a season.
 */
import * as cheerio from 'cheerio';
import { EngineError } from '../errors.js';
import { isButtonsBlock, linkOf, textOf } from '../html.js';
import { fetchHtml } from '../http.js';

/** @typedef {import('./hublinks.js').LinkGroup} LinkGroup @typedef {import('./hublinks.js').LinkLine} LinkLine */

// The post's own content: its title is `h1.post-title`, the rest of the page is the site's.
const CONTENT = '.entry-inner';
const HEADING = 'h1, h2, h3, h4, h5, h6';

/**
 * Reads one NexDrive page and returns all it states, as it states it.
 *
 * @param {string} url - On NexDrive's current domain.
 * @param {import('../http.js').RequestOptions} [options]
 * @returns {Promise<{ links: import('../html.js').Link[], title: string | null, tags: string[], sections: LinkGroup[] }>}
 *   `links`: every link of `sections`, in page order, each labelled by its own text ("⚡ V-Cloud
 *   [Resumable]"); `title`: the page's, which names its file or its season's quality ("Bypass Road
 *   (2019) Hindi 480p [400MB]", "Killer Ratings (Season-1) Hindi 720p (Episode 1-7) [550MB]");
 *   `tags`: none; `sections`: its links in groups and lines (sectionsOf).
 * @throws {EngineError} `unrecognized` for a page without its content (every live page has it),
 *   and fetchHtml's errors (`notFound`: a missing page answers HTTP 404).
 */
export async function expandNexDrive(url, options) {
  const page = await fetchHtml(url, options);
  const $ = cheerio.load(page.html, { baseURI: page.url });
  const content = $(CONTENT).first();
  if (content.length === 0) throw new EngineError('unrecognized', 'No content on the NexDrive page', { url });
  const sections = sectionsOf($, content);
  return {
    links: sections.flatMap(({ lines }) => lines.flatMap((line) => line.links)),
    title: textOf($('h1.post-title').first()) || null,
    tags: [],
    sections,
  };
}

/**
 * The content's lines of buttons, in the page's groups. A line is a block of buttons only
 * (isButtonsBlock); its title is the heading right before it ("-:Episodes: 1:-",
 * "-:Complete Zip Pack:-"), and none when something else is between them (a movie's one line,
 * under the page's note "Note : Use Download Manager…" and a divider): `<hr>` alone, between an
 * episode's title and its buttons or between episodes, changes nothing. A page whose episodes are
 * links of one paragraph ("Episode 1 Episode 2 …", 2021) has that paragraph as a line, each link
 * labelled by its episode. The page's own groups: its buttons, and a box of the file's other
 * mirrors (".su-box", titled "Alternative Sources": GoFile, 1fichier, … by their URLs). Nothing is
 * read from words.
 *
 * @returns {LinkGroup[]} In page order; a group without lines is left out.
 */
function sectionsOf($, content) {
  const main = { title: null, lines: [] };
  const boxes = new Map();
  let heading = null;
  for (const element of content.find(`${HEADING}, p, hr, div, center`).toArray()) {
    const $element = $(element);
    if ($element.parents(`${HEADING}, p`).length > 0) continue; // part of the block around it
    if ($element.is('hr')) continue;
    if ($element.is(HEADING)) {
      heading = textOf($element) || heading;
      continue;
    }
    if ($element.is('p') && isButtonsBlock($, element)) {
      const box = $element.closest('.su-box');
      let section = main;
      if (box.length > 0) {
        if (!boxes.has(box[0])) boxes.set(box[0], { title: textOf(box.find('.su-box-title').first()) || null, lines: [] });
        section = boxes.get(box[0]);
      }
      section.lines.push({ title: box.length > 0 ? null : heading, links: $element.find('a[href]').toArray().map((a) => linkOf($, a)), tags: [] });
      heading = null;
      continue;
    }
    // A block of its own (a note, a divider, a box), not one around others: what is between a
    // heading and the buttons after it.
    if ($element.is('p') || $element.find(`${HEADING}, p`).length === 0) heading = null;
  }
  return [main, ...boxes.values()].filter(({ lines }) => lines.length > 0);
}
