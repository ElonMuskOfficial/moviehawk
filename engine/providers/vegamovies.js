/**
 * Vegamovies (vegamovies.lease) and RogMovies (rogmovies.im): two sites of one WordPress theme
 * (`vegamoviesofficial`, `rogmoviesofficial`), read alike, each under its own id. Their post pages
 * (/<slug>/), listing pages (/, /page/<n>/) and the search API their search page asks
 * (/ts-search.php). Every download button leads to a NexDrive page (gateways/nexdrive.js).
 *
 * Live, 2026-11-03: 168 posts of 2020 to 2026 across both catalogs (Vegamovies' 785 listing pages,
 * RogMovies' 397), the same structure on each.
 */
import * as cheerio from 'cheerio';
import { EngineError } from '../errors.js';
import { isButtonsBlock, linkOf, textOf } from '../html.js';
import { fetchHtml, fetchJson } from '../http.js';
import { newLine, newSection } from '../sections.js';
import { webUrlOf } from '../urls.js';

/** @typedef {import('./index.js').Post} Post
 * @typedef {import('./index.js').PostCard} PostCard
 * @typedef {import('./index.js').Section} Section
 * @typedef {{ id: string, name: string }} Site The site a call reads: its provider id, and its
 *   name as it writes it, for messages ({ id: 'rogmovies', name: 'RogMovies' }). */

// A movie's title states its year, "Download Raazi (2018) …"; a series' at times not (live,
// 2026-11-03: 145 of 168).
const YEAR = /\((\d{4})\)/;
const IMDB_TITLE = /^\/title\/(tt\d+)\b/;
const HEADING = 'h1, h2, h3, h4, h5, h6';

/**
 * Reads one post page.
 *
 * @param {Site} site
 * @param {string} url - On the site's current domain.
 * @param {import('../http.js').RequestOptions} [options]
 * @returns {Promise<{ post: Post, sections: Section[] }>} Each part read the same way on both sites
 *   (168 of 168 posts): the title, `h1.post-title`; the poster, `og:image` (posterOf); the publication time,
 *   the post's `.post-date time[datetime]`; the IMDb id, from the body's link to IMDb's title
 *   page, where it has one (97 of 168).
 * @throws {EngineError} `unrecognized` for a page without the post's title (a challenge page, a
 *   changed layout), and fetchHtml's errors (`notFound`: a missing post answers HTTP 404).
 */
export async function scrapeVegamoviesPost(site, url, options) {
  const page = await fetchHtml(url, options);
  const $ = cheerio.load(page.html, { baseURI: page.url });
  const title = textOf($('h1.post-title').first());
  if (!title) throw new EngineError('unrecognized', `No title on the ${site.name} post page`, { url });
  const body = $('main.page-body').first();

  return {
    post: {
      provider: site.id,
      url: page.url,
      title,
      year: Number(YEAR.exec(title)?.[1]) || null,
      imdbId: imdbIdOf($, body),
      posterUrl: posterOf($),
      publishedAt: isoDateOf($('.post-date time[datetime]').first().attr('datetime')),
    },
    sections: sectionsOf($, body),
  };
}

/**
 * The post's download buttons, as the page groups them (live, 2026-11-03: 168 posts, 594 buttons
 * in 522 lines, all read alike):
 * - a line is a paragraph of buttons only (isButtonsBlock): "Download Now", or "G-Direct |
 *   V-Cloud | Batch/Zip". Its title is the heading right before it, which names its file
 *   ("Raazi (2018) Full Movie 720p [1.2GB]", "Season 1 {Hindi-Korean} 480p WEB-DL x264
 *   [160MB/E]"); none when the paragraph follows something else ("Watch Online", after a rule);
 * - a section is a heading that only rules (`<hr>`) part from the lines after it: "• Episodes 01
 *   To 04 •", "• iMAX – WEB-DL •"; or a rule after lines, which ends their section (Sherlock's
 *   seasons, 2020: a rule between each, no heading). A heading with anything else before the
 *   lines ("Movie Info:" over the info box, "Screenshots" over its images) titles nothing.
 * The other links are in sentences or the info box: the site's own ("RogMovies", a genre), IMDb's
 * rating. A button to another post of the site is a line as any: an English post's "Download Now"
 * to its Hindi one (live, 2026-11-03), which identify names a post. Nothing is read from words.
 *
 * @returns {Section[]} In page order; a section without lines is left out.
 */
function sectionsOf($, body) {
  const sections = [];
  let section = newSection();
  sections.push(section);
  // `heading`: the last heading, not yet used; `title`: a heading that only rules part from what
  // comes next, a section's title if lines come.
  let heading = null;
  let title = null;
  for (const element of body.find(`${HEADING}, p, hr`).toArray()) {
    const $element = $(element);
    if ($element.parents(`${HEADING}, p`).length > 0) continue; // part of the block around it
    if ($element.is('hr')) {
      if (heading) {
        title = heading;
        heading = null;
      } else if (section.lines.length > 0) {
        section = newSection();
        sections.push(section);
      }
      continue;
    }
    if ($element.is(HEADING)) {
      const text = textOf($element);
      if (!text) continue;
      if (heading) title = heading;
      heading = text;
      continue;
    }
    if (isButtonsBlock($, element)) {
      if (title) {
        section = newSection({ title });
        sections.push(section);
        title = null;
      }
      section.lines.push(newLine(heading, $element.find('a[href]').toArray().map((a) => linkOf($, a))));
      heading = null;
    } else if (textOf($element) || $element.find('img, a[href]').length > 0) {
      // A paragraph of text or images: what is before the lines is no title of theirs.
      heading = null;
      title = null;
    }
  }
  return sections.filter(({ lines }) => lines.length > 0);
}

/**
 * The post's poster: its `og:image`, on any host (TMDB, the site's uploads, Imgur), but for one on
 * the site's image proxy ("img.vegamovies.lease/<...>.webp?p=<post>&u=<base64 of the image's URL>",
 * 35 of 168 posts), whose hostnames no longer resolve (2026-11-03): its `u` is the image itself,
 * on TMDB (35 of 35).
 *
 * @returns {string | null}
 */
function posterOf($) {
  const image = webUrlOf($('meta[property="og:image"]').first().attr('content') ?? '');
  const source = image?.searchParams.get('u');
  return (source && webUrlOf(Buffer.from(source, 'base64').toString())?.href) || image?.href || null;
}

// The IMDb id, from the body's link to its title page ("www.imdb.com/title/tt22084616/").
function imdbIdOf($, body) {
  for (const a of body.find('a[href]').toArray()) {
    const url = webUrlOf($(a).prop('href'));
    const id = url && /(?:^|\.)imdb\.com$/.test(url.hostname) ? IMDB_TITLE.exec(url.pathname)?.[1] : null;
    if (id) return id;
  }
  return null;
}

// ISO 8601 in UTC; null for no date, or one that is no date.
function isoDateOf(text) {
  if (typeof text !== 'string') return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Reads one listing page: its grid of posts (".movies-grid", "Latest Releases": 18 a page on
 * Vegamovies, 20 on RogMovies, 21 on page 1). The page's other links are its slider, menus and tags.
 *
 * @param {Site} site
 * @param {string} url - Such as "https://vegamovies.lease/page/2/".
 * @param {import('../http.js').RequestOptions} [options]
 * @returns {Promise<{ posts: PostCard[], hasNextPage: boolean }>} `posts`: in page order, each
 *   card's title and poster: Vegamovies loads its images late, from `data-src` (its `src` is a
 *   placeholder), RogMovies from `src`. `hasNextPage`: whether the pagination links a next page.
 * @throws {EngineError} `unrecognized` for a page without posts, and fetchHtml's errors
 *   (`notFound`: a page after the last answers HTTP 404).
 */
export async function scrapeVegamoviesListing(site, url, options) {
  const page = await fetchHtml(url, options);
  const $ = cheerio.load(page.html, { baseURI: page.url });
  const posts = $('.movies-grid > a[href]').toArray().map((card) => {
    const image = $(card).find('img').first();
    const poster = [image.attr('data-src'), image.attr('src')].map((src) => src && webUrlOf(new URL(src, page.url).href)).find(Boolean);
    return {
      url: $(card).prop('href'),
      title: textOf($(card).find('.poster-title').first()) || image.attr('alt')?.trim() || '',
      posterUrl: poster?.href ?? null,
    };
  });
  if (posts.length === 0) throw new EngineError('unrecognized', `No posts on the ${site.name} listing page`, { url });
  return { posts, hasNextPage: $('.pagination a.next-btn[href]').length > 0 };
}

// The search page (/search.html?q=, where "/?s=" redirects) asks this API from the browser, the
// site's own: 15 posts a page, newest first (live, 2026-11-03).
const SEARCH_PATH = '/ts-search.php';

/**
 * Searches the site's posts as its search page does.
 *
 * @param {Site} site
 * @param {string} siteUrl - On the site's current domain.
 * @param {string} query
 * @param {number} page - From 1.
 * @param {import('../http.js').RequestOptions} [options]
 * @returns {Promise<{ posts: PostCard[], hasNextPage: boolean }>} `posts`: as the API orders them;
 *   none when nothing matches. A post's URL is its permalink, a path, on the site's domain.
 *   `hasNextPage`: whether the API has more posts than the pages up to this one hold.
 * @throws {EngineError} `notFound` for a page after the last; `unrecognized` for an answer without
 *   its hits; and fetchJson's errors.
 */
export async function searchVegamovies(site, siteUrl, query, page, options) {
  const api = new URL(SEARCH_PATH, siteUrl);
  api.searchParams.set('q', query);
  api.searchParams.set('page', String(page));
  const answer = await fetchJson(api.href, options);
  if (!Array.isArray(answer?.hits) || typeof answer.found !== 'number') {
    throw new EngineError('unrecognized', `No hits in the ${site.name} search answer`, { url: api.href });
  }
  // Every hit states its post's path and title: a card has both.
  if (!answer.hits.every((hit) => typeof hit?.document?.post_title === 'string' && typeof hit.document.permalink === 'string')) {
    throw new EngineError('unrecognized', `A hit without its post in the ${site.name} search answer`, { url: api.href });
  }
  const pageSize = Number(answer.request_params?.per_page) || 15;
  if (answer.hits.length === 0 && page > 1) {
    const last = Math.ceil(answer.found / pageSize) || 1;
    throw new EngineError('notFound', `${site.name} says page ${page} does not exist (its last is ${last})`, { url: api.href });
  }
  return {
    posts: answer.hits.map(({ document }) => ({
      url: `${siteUrl}${new URL(document.permalink, siteUrl).pathname}`,
      title: document.post_title,
      posterUrl: webUrlOf(document.post_thumbnail ?? '')?.href ?? null,
    })),
    hasNextPage: page * pageSize < answer.found,
  };
}
