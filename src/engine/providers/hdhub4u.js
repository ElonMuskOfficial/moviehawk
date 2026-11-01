/**
 * HDHub4u (new10.hdhub4u.cl): its post pages (/<slug>/), listing pages (/, /page/<n>/), and the
 * search API its search page asks.
 */
import * as cheerio from 'cheerio';
import { EngineError } from '../errors.js';
import { lineOf, lineStartOf, linkOf, textOf } from '../html.js';
import { fetchHtml, fetchJson } from '../http.js';
import { jsonLdOf } from '../json-ld.js';
import { webUrlOf } from '../urls.js';

/** @typedef {import('./index.js').Post} Post
 * @typedef {import('./index.js').PostCard} PostCard
 * @typedef {import('../html.js').Link} Link */

// A movie's title states its year, "Wrong Turn (2003) BluRay ..."; a series' does not,
// "MobLand (Season 2) ..." (live, 2026-10-31: 15 of 15 movies, 6 of 6 series).
const YEAR = /\((\d{4})\)/;
const IMDB_TITLE = /^\/title\/(tt\d+)\//;
// An episode's download button, first in its line: "EPiSODE 1 | WATCH".
const EPISODE = /^EPiSODE \d+$/i;
// A player's button: "WATCH", "WATCH-1", "PLAYER-2".
const PLAYER = /^(WATCH|PLAYER)\b[-\s]*\d*$/i;

// The post's IMDb id, from the one link in the box of its ratings: IMDb's title page
// ("www.imdb.com/title/tt0295700/reference/?ref_=fn_t_1"), or TMDB's for a title IMDb does not
// have (live, 2026-10-31: 18 and 3 of 21 posts).
function imdbIdOf(href) {
  if (!href) return null;
  const { hostname, pathname } = new URL(href);
  return hostname === 'www.imdb.com' ? IMDB_TITLE.exec(pathname)?.[1] ?? null : null;
}

// The post's publication time, ISO 8601 in UTC; null when the page states none, or one that is no
// date.
function isoDateOf(text) {
  if (typeof text !== 'string') return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
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
      publishedAt: isoDateOf(datePublished),
    },
    links: body.find('a[href]').toArray().map((a) => linkOf($, a, fileOf($, a), buttonOf($, a))),
  };
}

/**
 * A button's name. A player whose text is only its number is the line's next player, named as the
 * one before it: "EPiSODE 1 | WATCH-1 | 2" is WATCH-1 and WATCH-2 (live, 2026-11-01: The Great
 * Indian Kapil Show S05, each episode).
 *
 * @returns {string} The button's text, or the player's name for a number after a player.
 */
function buttonOf($, a) {
  const text = textOf($(a));
  const line = /^\d+$/.test(text) ? lineOf($, a) : null;
  if (!line) return text;
  const buttons = line.find('a[href]').toArray();
  const before = buttons[buttons.indexOf(a) - 1];
  const player = before && PLAYER.exec(textOf($(before)))?.[1];
  return player ? `${player}-${text}` : text;
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
 * @returns {Promise<{ posts: PostCard[], hasNextPage: boolean }>} `posts`: in page order. A card's
 *   title is its caption, the post's title; its image is the poster, smaller than on the post page
 *   (w342, not w400). `hasNextPage`: whether the pagination links a next page (live, 2026-10-31:
 *   every page but the last, 971).
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
  return { posts, hasNextPage: $('.pagination a.next[href]').length > 0 };
}

// HDHub4u's search page (/search.html) asks this API from the browser, 15 posts a page (live,
// 2026-10-31). The engine asks it as the page does, without the page's analytics tag, so the
// site's "popular searches" do not count the engine's.
const SEARCH_API = 'https://search.pingora.fyi/collections/post/documents/search';
const SEARCH_PAGE_SIZE = 15;

/**
 * Searches HDHub4u's posts as its search page does. The API answers 403 without the site as
 * Referer.
 *
 * @param {string} siteUrl - On HDHub4u's current domain.
 * @param {string} query
 * @param {number} page - From 1.
 * @param {import('../http.js').RequestOptions} [options]
 * @returns {Promise<{ posts: PostCard[], hasNextPage: boolean }>} `posts`: newest first, as the
 *   page sorts them; none when nothing matches. A post's URL is its permalink's path on the site's
 *   domain, as the page links it: the API keeps the domain a post was published on
 *   ("new2.hdhub4u.free", live 2026-10-31: 5 of 6 for "mirzapur"). `hasNextPage`: whether the API
 *   has more posts than the pages up to this one hold.
 * @throws {EngineError} `notFound` for a page after the last; `unrecognized` for an answer without
 *   its hits; and fetchJson's errors.
 */
export async function searchHdHub4u(siteUrl, query, page, options) {
  const api = new URL(SEARCH_API);
  const params = {
    q: query,
    query_by: 'post_title,category,stars,director,imdb_id',
    query_by_weights: '4,2,2,2,4',
    sort_by: 'sort_by_date:desc',
    limit: SEARCH_PAGE_SIZE,
    highlight_fields: 'none',
    use_cache: 'true',
    page,
  };
  for (const [name, value] of Object.entries(params)) api.searchParams.set(name, String(value));
  const answer = await fetchJson(api.href, { ...options, headers: { ...options?.headers, Referer: `${new URL(siteUrl).origin}/` } });
  if (!Array.isArray(answer?.hits) || typeof answer.found !== 'number') {
    throw new EngineError('unrecognized', 'No hits in the HDHub4u search answer', { url: api.href });
  }
  // Every hit states its post's link and title: a card has both.
  if (!answer.hits.every((hit) => typeof hit?.document?.post_title === 'string' && webUrlOf(hit.document.permalink))) {
    throw new EngineError('unrecognized', 'A hit without its post in the HDHub4u search answer', { url: api.href });
  }
  if (answer.hits.length === 0 && page > 1) {
    const last = Math.ceil(answer.found / SEARCH_PAGE_SIZE) || 1;
    throw new EngineError('notFound', `HDHub4u says page ${page} does not exist (its last is ${last})`, { url: api.href });
  }
  return {
    posts: answer.hits.map(({ document }) => ({
      url: new URL(new URL(document.permalink).pathname, siteUrl).href,
      title: document.post_title,
      posterUrl: document.post_thumbnail ?? null,
    })),
    hasNextPage: page * SEARCH_PAGE_SIZE < answer.found,
  };
}
