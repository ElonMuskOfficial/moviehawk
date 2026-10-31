/**
 * 4KHDHub (4khdhub.one): its post pages (/<slug>-<movie|series>-<id>/) and listing pages (/,
 * /page/<n>/). Every file is one block on a post page (`.download-item` for a movie or a season
 * pack, `.episode-download-item` for an episode) with its buttons.
 */
import * as cheerio from 'cheerio';
import { EngineError } from '../errors.js';
import { linkOf, textOf } from '../html.js';
import { fetchHtml } from '../http.js';
import { jsonLdOf } from '../json-ld.js';

/** @typedef {import('./index.js').Post} Post
 * @typedef {import('../html.js').Link} Link */

/**
 * Reads one 4KHDHub post page. 4KHDHub finds a post by the number at the end of its URL; for a
 * number it has no post for, it answers HTTP 200 with the JSON
 * {"success":false,"message":"TMDB ID is required"} (live, 2026-10-31).
 *
 * @param {string} url - On 4KHDHub's current domain.
 * @param {import('../http.js').RequestOptions} [options]
 * @returns {Promise<{ post: Post, links: Link[] }>} `links`: the buttons of every block, in page
 *   order, each labelled with its block's file and its own server, as the page states them:
 *   "Addicted (1080p WEB-DL H264 AVC) 7 GB English WEB-DL · Download HubCloud". The page states no
 *   publication date and no IMDb id.
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
    links: $('.download-item a[href], .episode-download-item a[href]').toArray().map((a) => linkOf($, a, fileOf($, a))),
  };
}

// A listing page's number in its URL: "/page/2/" is 2, "/" is 1.
const LISTING_PAGE = /^\/page\/(\d+)\/?$/;

/**
 * Reads one 4KHDHub listing page: its grid of posts. A page after the last answers HTTP 200,
 * without posts, and its pagination marks the last page as the current one (live, 2026-10-31:
 * /page/408/ and /page/99999/ both mark 407).
 *
 * @param {string} url - Such as "https://4khdhub.one/page/2/".
 * @param {import('../http.js').RequestOptions} [options]
 * @returns {Promise<{ postUrls: string[] }>} In page order (each card links its post once).
 * @throws {EngineError} `notFound` for a page after the last; `unrecognized` for a page without
 *   posts; and fetchHtml's errors.
 */
export async function scrape4kHdHubListing(url, options) {
  const page = await fetchHtml(url, options);
  const $ = cheerio.load(page.html, { baseURI: page.url });
  const requested = Number(LISTING_PAGE.exec(new URL(url).pathname)?.[1] ?? 1);
  const current = Number(textOf($('.pagination .pagination-item.active').first()));
  if (current && current !== requested) {
    throw new EngineError('notFound', `4KHDHub says listing page ${requested} does not exist (its last is ${current})`, { url });
  }
  const postUrls = $('.card-grid a[href]').toArray().map((a) => $(a).prop('href'));
  if (postUrls.length === 0) throw new EngineError('unrecognized', 'No posts on the 4KHDHub listing page', { url });
  return { postUrls };
}

/**
 * What a button's block says of its file; the button itself names only its server. A movie's or a
 * season pack's block: its header ("Addicted (1080p WEB-DL H264 AVC) 7 GB English WEB-DL"). An
 * episode's: its season's heading and its own number and size ("S02 1080p WEB-DL H264
 * Episode-01 4.01 GB"). Live, 2026-10-31: 154 of 154 blocks and 439 of 439 episodes of 30 posts.
 *
 * @returns {string}
 */
function fileOf($, a) {
  const episode = $(a).closest('.episode-download-item');
  if (episode.length === 0) return textOf($(a).closest('.download-item').find('.download-header .flex-1').first());
  const season = textOf(episode.closest('.season-item').find('.episode-title').first());
  return `${season} ${textOf(episode.find('.episode-file-info').first())}`;
}

/** @returns {boolean} Whether the page is 4KHDHub's answer for a post it does not have. */
function isMissingPost(html) {
  try {
    return JSON.parse(html).success === false;
  } catch {
    return false; // Not JSON: an HTML page without a title.
  }
}
