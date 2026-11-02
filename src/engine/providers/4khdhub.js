/**
 * 4KHDHub (4khdhub.one): its post pages (/<slug>-<movie|series>-<id>/), listing pages (/,
 * /page/<n>/) and search pages (/?s=<query>). Every file is one block on a post page
 * (`.download-item` for a movie or a season pack, `.episode-download-item` for an episode) with its
 * buttons.
 */
import * as cheerio from 'cheerio';
import { EngineError } from '../errors.js';
import { linkOf, textOf } from '../html.js';
import { fetchHtml } from '../http.js';
import { jsonLdOf } from '../json-ld.js';
import { newLine, newSection } from '../sections.js';

/** @typedef {import('./index.js').Post} Post
 * @typedef {import('./index.js').PostCard} PostCard
 * @typedef {import('./index.js').Section} Section */

const BLOCK = '.download-item, .episode-download-item';

/**
 * Reads one 4KHDHub post page. 4KHDHub finds a post by the number at the end of its URL; for a
 * number it has no post for, it answers HTTP 200 with the JSON
 * {"success":false,"message":"TMDB ID is required"} (live, 2026-10-31).
 *
 * @param {string} url - On 4KHDHub's current domain.
 * @param {import('../http.js').RequestOptions} [options]
 * @returns {Promise<{ post: Post, sections: Section[] }>} `sections`: the buttons of every block, as
 *   the page groups them (sectionsOf). The page states no publication date and no IMDb id.
 * @throws {EngineError} `notFound` for 4KHDHub's answer to a missing post; `unrecognized` for a
 *   page without the post's title (a challenge page, a changed layout); and fetchHtml's errors.
 */
export async function scrape4kHdHubPost(url, options) {
  const page = await fetchHtml(url, options);
  const $ = cheerio.load(page.html, { baseURI: page.url });
  const title = textOf($('h1.page-title').first());
  if (!title) {
    if (isMissingPost(page.html)) throw new EngineError('notFound', '4KHDHub says the post does not exist', { url });
    throw new EngineError('unrecognized', 'No title on the 4KHDHub post page', { url });
  }
  // A movie states its release year in datePublished, a series in startDate ("2014").
  const media = jsonLdOf($, ['Movie', 'TVSeries']);

  return {
    post: {
      provider: '4khdhub',
      url: page.url,
      title,
      year: Number(media?.datePublished ?? media?.startDate) || null,
      imdbId: null,
      posterUrl: media?.image ?? null,
      publishedAt: null,
    },
    sections: sectionsOf($),
  };
}

/**
 * The page's blocks, as it groups them: a section per `h2.section-title` ("Download Links" for a
 * movie, "Download Complete Season" for a series' packs), and per season's group of episodes
 * (`.season-item`, titled by its `h3.episode-title`: "S01 AVC 1080p WEB-DL H264", tagged with its
 * badges: "Episodes 4", "English, Swedish"; `episodes`, as it is one); a line per block
 * (lineOfBlock), its buttons "Download
 * HubDrive" and "Download HubCloud". A series shows its sections in two tabs, "Zip/Pack" and
 * "Single EP's": each section has the label of the tab it is in, by the tab's `data-tab`, which is
 * its content's `id` (live, 2026-11-02: 100 posts, 59 series, 4,836 blocks, each in a section, each
 * with its file and 2 buttons). A section without blocks ("Download Individual Episodes", whose
 * blocks are in its seasons' groups; "You May Also Like") is left out.
 *
 * @returns {Section[]} In page order.
 */
function sectionsOf($) {
  const sections = [];
  let section = null;
  const open = (element, stated) => {
    const content = element.closest('.series-tab-content').attr('id');
    const tab = content ? textOf($('.series-tab').filter((_, button) => $(button).attr('data-tab') === content).first()) : null;
    section = newSection({ ...stated, tab });
    sections.push(section);
  };
  for (const element of $(`h2.section-title, .season-item, ${BLOCK}`).toArray()) {
    const $element = $(element);
    if ($element.is('h2.section-title')) open($element, { title: textOf($element) });
    else if ($element.is('.season-item')) {
      const tags = badgesOf($, $element.find('.episode-meta').first());
      open($element, { title: textOf($element.find('.episode-title').first()), tags, episodes: true });
    } else if ($element.parents(BLOCK).length === 0) {
      if (!section) open($element, {});
      section.lines.push(lineOfBlock($, $element));
    }
  }
  return sections.filter(({ lines }) => lines.length > 0);
}

/** @returns {string[]} The texts of an element's badges, as the page gives them, in its order. */
function badgesOf($, element) {
  return element.find('.badge').toArray().map((badge) => textOf($(badge))).filter(Boolean);
}

// A page's number in its URL: "/page/2/" is 2, "/" is 1 (listing and search pages alike).
const PAGE_NUMBER = /^\/page\/(\d+)\/?$/;

/**
 * Reads one 4KHDHub listing page: its grid of posts. A page after the last answers HTTP 200,
 * without posts, and its pagination marks the last page as the current one (live, 2026-10-31:
 * /page/408/ and /page/99999/ both mark 407).
 *
 * @param {string} url - Such as "https://4khdhub.one/page/2/".
 * @param {import('../http.js').RequestOptions} [options]
 * @returns {Promise<{ posts: PostCard[], hasNextPage: boolean }>} `posts`: in page order. A
 *   movie's card title has no year, "Act of Valor", where its post page has "Act of Valor (2012)".
 *   `hasNextPage`: whether the pagination links a next page (live, 2026-10-31: every page but the
 *   last, 407).
 * @throws {EngineError} `notFound` for a page after the last; `unrecognized` for a page without
 *   posts; and fetchHtml's errors.
 */
export async function scrape4kHdHubListing(url, options) {
  const page = await fetchHtml(url, options);
  const $ = cheerio.load(page.html, { baseURI: page.url });
  const cards = cardsOf($, url);
  if (cards.posts.length === 0) throw new EngineError('unrecognized', 'No posts on the 4KHDHub listing page', { url });
  return cards;
}

/**
 * Searches 4KHDHub's posts as its search box does: its own search page, "/?s=dexter", then
 * "/page/2/?s=dexter", with the listing's grid and pagination.
 *
 * @param {string} siteUrl - On 4KHDHub's current domain.
 * @param {string} query
 * @param {number} page - From 1.
 * @param {import('../http.js').RequestOptions} [options]
 * @returns {Promise<{ posts: PostCard[], hasNextPage: boolean }>} As scrape4kHdHubListing; no
 *   posts when nothing matches (the page shows an empty grid and "Oops! No results Found").
 * @throws {EngineError} `notFound` for a page after the last; `unrecognized` for a page without
 *   the grid (a challenge page, a changed layout); and fetchHtml's errors.
 */
export async function search4kHdHub(siteUrl, query, page, options) {
  const url = new URL(page === 1 ? '/' : `/page/${page}/`, siteUrl);
  url.searchParams.set('s', query);
  const fetched = await fetchHtml(url.href, options);
  const $ = cheerio.load(fetched.html, { baseURI: fetched.url });
  if ($('.card-grid').length === 0) throw new EngineError('unrecognized', 'No results grid on the 4KHDHub search page', { url: url.href });
  return cardsOf($, url.href);
}

/**
 * The cards of a listing or search page, and whether a next page follows.
 *
 * @returns {{ posts: PostCard[], hasNextPage: boolean }}
 * @throws {EngineError} `notFound` when the page is not the one asked for: 4KHDHub answers a page
 *   after the last as the last.
 */
function cardsOf($, url) {
  const requested = Number(PAGE_NUMBER.exec(new URL(url).pathname)?.[1] ?? 1);
  const current = Number(textOf($('.pagination .pagination-item.active').first()));
  if (current && current !== requested) {
    throw new EngineError('notFound', `4KHDHub says page ${requested} does not exist (its last is ${current})`, { url });
  }
  const posts = $('.card-grid a[href]').toArray().map((card) => ({
    url: $(card).prop('href'),
    title: textOf($(card).find('.movie-card-title').first()),
    posterUrl: $(card).find('img[src]').first().prop('src') ?? null,
  }));
  return { posts, hasNextPage: $('.pagination a.pagination-next[href]').length > 0 };
}

/**
 * A block as a line, with what it says of its file; its buttons name only their server. Each part
 * is read by its class, never by its words (live, 2026-11-02: 100 posts):
 * - a movie's or a season pack's block (`.download-item`, 403 of 403): its title, the header's text
 *   ("Addicted (1080p WEB-DL H264 AVC)"); its tags, the header's badges as the page gives them
 *   ("7 GB", "English", "WEB-DL": always 3, of one class, so what each is is not read); its file's
 *   name, `.file-title` ("Addicted.2014.1080p.WEB-DL.H264-4kHdHub.Com.mkv");
 * - an episode's (`.episode-download-item`, 4,433 of 4,433): its title, `.badge-psa`
 *   ("Episode-01"); its tag, its size, `.badge-size` ("4.01 GB"); its file's name,
 *   `.episode-file-title`. Its season is its section's title.
 *
 * @param {import('cheerio').Cheerio<any>} block
 * @returns {import('./index.js').Line}
 */
function lineOfBlock($, block) {
  const links = block.find('a[href]').toArray().map((a) => linkOf($, a));
  if (block.is('.episode-download-item')) {
    return newLine(textOf(block.find('.badge-psa').first()), links, {
      file: textOf(block.find('.episode-file-title').first()),
      tags: [textOf(block.find('.badge-size').first())].filter(Boolean),
    });
  }
  const header = block.find('.download-header .flex-1').first();
  const name = header.clone();
  name.find('code, .badge').remove();
  return newLine(textOf(name), links, { file: textOf(block.find('.file-title').first()), tags: badgesOf($, header) });
}

/** @returns {boolean} Whether the page is 4KHDHub's answer for a post it does not have. */
function isMissingPost(html) {
  try {
    return JSON.parse(html).success === false;
  } catch {
    return false; // Not JSON: an HTML page without a title.
  }
}
