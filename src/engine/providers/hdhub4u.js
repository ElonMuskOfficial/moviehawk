/**
 * HDHub4u (new10.hdhub4u.cl): its post pages (/<slug>/) and listing pages (/, /page/<n>/).
 */
import * as cheerio from 'cheerio';
import { EngineError } from '../errors.js';
import { lineOf, lineStartOf, linkOf, textOf } from '../html.js';
import { fetchHtml } from '../http.js';
import { jsonLdOf } from '../json-ld.js';

/** @typedef {import('./index.js').Post} Post
 * @typedef {import('./index.js').PostCard} PostCard
 * @typedef {import('../html.js').Link} Link */

// A movie's title states its year, "Wrong Turn (2003) BluRay ..."; a series' does not,
// "MobLand (Season 2) ..." (live, 2026-10-31: 15 of 15 movies, 6 of 6 series).
const YEAR = /\((\d{4})\)/;
const IMDB_TITLE = /^\/title\/(tt\d+)\//;
// An episode's download button, first in its line: "EPiSODE 1 | WATCH".
const EPISODE = /^EPiSODE \d+$/i;

// The post's IMDb id, from the one link in the box of its ratings: IMDb's title page
// ("www.imdb.com/title/tt0295700/reference/?ref_=fn_t_1"), or TMDB's for a title IMDb does not
// have (live, 2026-10-31: 18 and 3 of 21 posts).
function imdbIdOf(href) {
  if (!href) return null;
  const { hostname, pathname } = new URL(href);
  return hostname === 'www.imdb.com' ? IMDB_TITLE.exec(pathname)?.[1] ?? null : null;
}

/**
 * Reads one HDHub4u post page.
 *
 * @param {string} url - On HDHub4u's current domain.
 * @param {import('../http.js').RequestOptions} [options]
 * @returns {Promise<{ post: Post, links: Link[] }>} `links`: every link in the post's body, in
 *   page order, as the page gives them (gateways, hosts, screenshots, IMDb). A quality button's
 *   label is its own text, which states its file ("720p x264 [850MB]"); an episode line's button
 *   names only its server, so its label is its file and then the button ("EPiSODE 1 720p ·
 *   Drive").
 * @throws {EngineError} `unrecognized` for a page without the post's title (a challenge page, a
 *   changed layout), and fetchHtml's errors (`notFound`: HDHub4u answers a missing post with
 *   HTTP 404).
 */
export async function scrapeHdHub4uPost(url, options) {
  const page = await fetchHtml(url, options);
  const $ = cheerio.load(page.html, { baseURI: page.url });
  const title = textOf($('h1.page-title .material-text').first());
  if (!title) throw new EngineError('unrecognized', 'No title on the HDHub4u post page', { url });
  const body = $('main.page-body').first();
  const datePublished = jsonLdOf($, ['BlogPosting'])?.datePublished;

  return {
    post: {
      provider: 'hdhub4u',
      url: page.url,
      title,
      year: Number(YEAR.exec(title)?.[1]) || null,
      imdbId: imdbIdOf($('[data-attrid="kc:/film/film:reviews"] a[href]').first().prop('href')),
      // The poster is the body's first image.
      posterUrl: body.find('img[src]').first().prop('src') ?? null,
      publishedAt: datePublished ? new Date(datePublished).toISOString() : null,
    },
    links: body.find('a[href]').toArray().map((a) => linkOf($, a, fileOf($, a))),
  };
}

/**
 * What the page says of a button's file when the button shares its line with others. A series
 * lists each episode as a heading and then a line per quality:
 * "EPiSODE 1", then "720p – Drive | Instant | WATCH" and "1080p – Drive | Instant" (live,
 * 2026-10-31: 480 links of 38 posts); or each episode as a line, "EPiSODE 1 | WATCH". A button
 * alone in its heading ("720p x264 [850MB]") states its file itself.
 *
 * @returns {string} Such as "EPiSODE 1 720p"; empty when the button states its file itself, or
 *   its line names none ("WATCH | PLAYER-2").
 */
function fileOf($, a) {
  const line = lineOf($, a);
  if (!line) return '';
  let episode = '';
  // The episode's heading is the nearest heading above without links; anything else (an <hr>, the
  // section's ": DOWNLOAD LINKS :" box) ends the search.
  for (let above = line.prev(); above.is('h1, h2, h3, h4, h5, h6'); above = above.prev()) {
    if (above.find('a[href]').length === 0) {
      episode = textOf(above);
      break;
    }
  }
  const quality = lineStartOf(line);
  if (episode || quality) return [episode, quality].filter(Boolean).join(' ');
  // A line of its own episode: "EPiSODE 1 | WATCH" (live: 102 lines on 46 posts); its players are
  // the episode's. A line of players only, "WATCH | PLAYER-2", names no file.
  const first = line.find('a[href]').first();
  return first[0] !== a && EPISODE.test(textOf(first)) ? textOf(first) : '';
}

/**
 * Reads one HDHub4u listing page: its grid of posts. The page's other links are categories and
 * the site's own pages. Page 1 lists about as many posts as pages 2 to 6, which list 15 each, so
 * pages share posts (live, 2026-10-31: 85 posts on page 1, 14 of page 2's on it).
 *
 * @param {string} url - Such as "https://new10.hdhub4u.cl/page/2/".
 * @param {import('../http.js').RequestOptions} [options]
 * @returns {Promise<{ posts: PostCard[] }>} In page order. A card's title is its caption, the
 *   post's title; its image is the poster, smaller than on the post page (w342, not w400).
 * @throws {EngineError} `unrecognized` for a page without posts, and fetchHtml's errors
 *   (`notFound`: HDHub4u answers a page after the last with HTTP 404).
 */
export async function scrapeHdHub4uListing(url, options) {
  const page = await fetchHtml(url, options);
  const $ = cheerio.load(page.html, { baseURI: page.url });
  const posts = $('ul.recent-movies li').toArray().map((card) => ({
    url: $(card).find('figcaption a[href]').first().prop('href'),
    title: textOf($(card).find('figcaption').first()),
    posterUrl: $(card).find('img[src]').first().prop('src') ?? null,
  }));
  if (posts.length === 0) throw new EngineError('unrecognized', 'No posts on the HDHub4u listing page', { url });
  return { posts };
}
