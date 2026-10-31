/**
 * HDHub4u (new10.hdhub4u.cl): its post pages (/<slug>/) and listing pages (/, /page/<n>/).
 */
import * as cheerio from 'cheerio';
import { EngineError } from '../errors.js';
import { fetchHtml } from '../http.js';
import { jsonLdOf } from './json-ld.js';

/**
 * @typedef {{ provider: string, url: string, title: string, year: number | null,
 *   imdbId: string | null, posterUrl: string | null, publishedAt: string | null }} Post
 *   `url`: the post's address after redirects; `publishedAt`: ISO 8601, UTC.
 */

// A movie's title states its year, "Wrong Turn (2003) BluRay ..."; a series' does not,
// "MobLand (Season 2) ..." (live, 2026-10-31: 15 of 15 movies, 6 of 6 series).
const YEAR = /\((\d{4})\)/;
const IMDB_TITLE = /^\/title\/(tt\d+)\//;

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
 * @returns {Promise<{ post: Post, links: Array<{ url: string, statedLanguages: null }> }>}
 *   `links`: every link in the post's body, in page order, as the page gives them (gateways, hosts,
 *   screenshots, IMDb); HDHub4u states no languages per link.
 * @throws {EngineError} `unrecognized` for a page without the post's title (a challenge page, a
 *   changed layout), and fetchHtml's errors (`notFound`: HDHub4u answers a missing post with
 *   HTTP 404).
 */
export async function scrapeHdHub4uPost(url, options) {
  const page = await fetchHtml(url, options);
  const $ = cheerio.load(page.html, { baseURI: page.url });
  const title = $('h1.page-title .material-text').first().text().replace(/\s+/g, ' ').trim();
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
    links: body.find('a[href]').toArray().map((a) => ({ url: $(a).prop('href'), statedLanguages: null })),
  };
}

/**
 * Reads one HDHub4u listing page: its grid of posts. The page's other links are categories and
 * the site's own pages.
 *
 * @param {string} url - Such as "https://new10.hdhub4u.cl/page/2/".
 * @param {import('../http.js').RequestOptions} [options]
 * @returns {Promise<{ postUrls: string[] }>} Each post once (a post's image and caption both link
 *   it), in page order.
 * @throws {EngineError} `unrecognized` for a page without posts, and fetchHtml's errors
 *   (`notFound`: HDHub4u answers a page after the last with HTTP 404).
 */
export async function scrapeHdHub4uListing(url, options) {
  const page = await fetchHtml(url, options);
  const $ = cheerio.load(page.html, { baseURI: page.url });
  const postUrls = [...new Set($('ul.recent-movies a[href]').toArray().map((a) => $(a).prop('href')))];
  if (postUrls.length === 0) throw new EngineError('unrecognized', 'No posts on the HDHub4u listing page', { url });
  return { postUrls };
}
