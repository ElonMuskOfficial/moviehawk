/**
 * 4KHDHub (4khdhub.one): its post pages (/<slug>-<movie|series>-<id>/) and listing pages (/,
 * /page/<n>/). Every file is one block on a post page (`.download-item` for a movie or a season
 * pack, `.episode-download-item` for an episode) with its buttons, and badges naming its size,
 * source and languages.
 */
import * as cheerio from 'cheerio';
import { EngineError } from '../errors.js';
import { fetchHtml } from '../http.js';
import { jsonLdOf } from './json-ld.js';

/** @typedef {import('./index.js').Post} Post */
/** @typedef {import('./index.js').PostLink} PostLink */

// The languages badge is told apart from the others (size, source, codec) by its color, the one
// thing that marks a badge's kind (live, 2026-10-31: 785 of 785 blocks have one, and it names
// languages only).
const LANGUAGES_COLOR = '#0d9488';

/**
 * Reads one 4KHDHub post page. 4KHDHub finds a post by the number at the end of its URL; for a
 * number it has no post for, it answers HTTP 200 with the JSON
 * {"success":false,"message":"TMDB ID is required"} (live, 2026-10-31).
 *
 * @param {string} url - On 4KHDHub's current domain.
 * @param {import('../http.js').RequestOptions} [options]
 * @returns {Promise<{ post: Post, links: PostLink[] }>}
 *   `links`: the buttons of every block, in page order; `statedLanguages`: as the block's badge
 *   states them ("Hindi, English"). The page states no publication date and no IMDb id.
 * @throws {EngineError} `notFound` for 4KHDHub's answer to a missing post; `unrecognized` for a
 *   page without the post's title (a challenge page, a changed layout); and fetchHtml's errors.
 */
export async function scrape4kHdHubPost(url, options) {
  const page = await fetchHtml(url, options);
  const $ = cheerio.load(page.html, { baseURI: page.url });
  const title = $('h1.page-title').first().text().replace(/\s+/g, ' ').trim();
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
    links: $('.download-item a[href], .episode-download-item a[href]').toArray().map((a) => ({
      url: $(a).prop('href'),
      // An episode's languages are stated once, for its season.
      statedLanguages: $(a).closest('.download-item, .season-item').find('.badge').toArray()
        .map((badge) => $(badge))
        .find((badge) => badge.css('background-color') === LANGUAGES_COLOR)?.text().trim() ?? null,
    })),
  };
}

/**
 * Reads one 4KHDHub listing page: its grid of posts. A page after the last answers as the last
 * page (live, 2026-10-31: /page/99999/ is page 407).
 *
 * @param {string} url - Such as "https://4khdhub.one/page/2/".
 * @param {import('../http.js').RequestOptions} [options]
 * @returns {Promise<{ postUrls: string[] }>} In page order (each card links its post once).
 * @throws {EngineError} `unrecognized` for a page without posts, and fetchHtml's errors.
 */
export async function scrape4kHdHubListing(url, options) {
  const page = await fetchHtml(url, options);
  const $ = cheerio.load(page.html, { baseURI: page.url });
  const postUrls = $('.card-grid a[href]').toArray().map((a) => $(a).prop('href'));
  if (postUrls.length === 0) throw new EngineError('unrecognized', 'No posts on the 4KHDHub listing page', { url });
  return { postUrls };
}

/** @returns {boolean} Whether the page is 4KHDHub's answer for a post it does not have. */
function isMissingPost(html) {
  try {
    return JSON.parse(html).success === false;
  } catch {
    return false; // Not JSON: an HTML page without a title.
  }
}
