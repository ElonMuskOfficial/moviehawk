import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { scrapeHdHub4uListing, scrapeHdHub4uPost, searchHdHub4u } from '../../../src/engine/providers/hdhub4u.js';

const MOVIE_URL = 'https://new10.hdhub4u.cl/wrong-turn-2003-hindi-bluray-full-movie/';
// Live pages (2026-10-31): a movie, a series that links TMDB instead of IMDb, and listing page 2;
// and the search API's answer for "mirzapur".
const fixture = (name) => readFileSync(new URL(`../../fixtures/hdhub4u-${name}.html`, import.meta.url), 'utf8');
const answer = (body, status = 200) => ({ fetch: async () => new Response(body, { status }) });
const hostnamesOf = (links) => links.map(({ url }) => new URL(url).hostname);

describe('scrapeHdHub4uPost', () => {
  it('reads a movie post: title, year, IMDb id, poster and publication date', async () => {
    const { post } = await scrapeHdHub4uPost(MOVIE_URL, answer(fixture('movie')));

    assert.deepEqual(post, {
      provider: 'hdhub4u',
      url: MOVIE_URL,
      title: 'Wrong Turn (2003) BluRay [Hindi (DD5.1) & English] 1080p 720p & 480p Dual Audio [x264] | Full Movie',
      year: 2003,
      imdbId: 'tt0295700',
      posterUrl: 'https://imgshare.info/images/2026/08/19/Wrong-Turn-2003.jpg',
      publishedAt: '2026-08-19T04:16:42.000Z',
    });
  });

  it('gives every link in the post\'s body, in page order, as the page gives them', async () => {
    const { links } = await scrapeHdHub4uPost(MOVIE_URL, answer(fixture('movie')));

    assert.deepEqual(hostnamesOf(links), [
      'new10.hdhub4u.cl', 'new10.hdhub4u.cl', 'whatsapp.com', 'www.imdb.com',
      'greenmotors.club', 'greenmotors.club', 'greenmotors.club', 'hubdrive.bar', 'greenmotors.club',
    ]);
  });

  it('labels a button alone in its heading with its own text', async () => {
    const { links } = await scrapeHdHub4uPost(MOVIE_URL, answer(fixture('movie')));

    assert.deepEqual(links.slice(4).map(({ label }) => label), [
      '480p⚡[320MB]', '720p x264 [850MB]', '1080p x264 [1.7GB]', '1080p BluRay [20.42GB]', 'Watch Online',
    ]);
  });

  it('labels an episode line\'s buttons with the episode, the line\'s quality and the button', async () => {
    const { links } = await scrapeHdHub4uPost(MOVIE_URL, answer(fixture('series')));

    assert.deepEqual(links.map(({ label }) => label).filter((label) => label?.startsWith('EPiSODE 1 ')), [
      'EPiSODE 1 720p · Drive', 'EPiSODE 1 720p · Instant', 'EPiSODE 1 720p · WATCH',
      'EPiSODE 1 1080p · Drive', 'EPiSODE 1 1080p · Instant',
    ]);
  });

  it('labels a line\'s players with its episode, and a link in prose with its own text', async () => {
    // Shapes of live posts (2026-10-31): an episode's line right under the ": DOWNLOAD LINKS :" box,
    // a movie's players, and a link in the post's prose.
    const page = `<h1 class="page-title"><span class="material-text">Show</span></h1><main class="page-body">
      <div>: DOWNLOAD LINKS :</div><h3><a href="https://greenmotors.club/?id=1">EPiSODE 1</a> | <a href="https://hubstream.art/#a">WATCH</a></h3>
      <hr><h4><a href="https://hdstream4u.com/file/b">WATCH</a> | <a href="https://hubstream.art/#c">PLAYER-2</a></h4>
      <p>Download Show in Hindi <a href="https://greenmotors.club/?id=2">HDHub4u</a></p></main>`;

    const { links } = await scrapeHdHub4uPost(MOVIE_URL, answer(page));

    assert.deepEqual(links.map(({ label }) => label), ['EPiSODE 1', 'EPiSODE 1 · WATCH', 'WATCH', 'PLAYER-2', 'HDHub4u']);
  });

  it('has no year and no IMDb id for a series that links TMDB in IMDb\'s box', async () => {
    const { post, links } = await scrapeHdHub4uPost('https://new10.hdhub4u.cl/s/', answer(fixture('series')));

    assert.equal(post.year, null);
    assert.equal(post.imdbId, null);
    assert.equal(post.publishedAt, '2026-10-31T08:32:59.000Z');
    assert.equal(links.length, 30);
  });

  it('is unrecognized for a page without the post\'s title', async () => {
    const page = '<html><title>Just a moment...</title><body>Checking your browser</body></html>';
    await assert.rejects(scrapeHdHub4uPost(MOVIE_URL, answer(page)), { code: 'unrecognized', url: MOVIE_URL });
  });

  it('is notFound when HDHub4u answers HTTP 404, as it does for a missing post', async () => {
    await assert.rejects(scrapeHdHub4uPost(MOVIE_URL, answer('Page not found', 404)), { code: 'notFound', status: 404 });
  });
});

describe('scrapeHdHub4uListing', () => {
  it('gives each card of the grid once, in page order: URL, title and poster', async () => {
    const { posts } = await scrapeHdHub4uListing('https://new10.hdhub4u.cl/page/2/', answer(fixture('listing')));

    assert.equal(posts.length, 15);
    assert.deepEqual(posts[0], {
      url: 'https://new10.hdhub4u.cl/dont-trouble-the-trouble-2026-webrip-hindi-full-movie/',
      title: 'Don’t Trouble the Trouble (2026) WEB-DL [Hindi (DD5.1) & Telugu] 4K 1080p 720p & 480p Dual Audio [x264/HEVC] | Full Movie',
      posterUrl: 'https://image.tmdb.org/t/p/w342/A0uqqpeLhGfOsW6muky7xvLd8Qf.jpg',
    });
    assert.equal(posts.at(-1).url, 'https://new10.hdhub4u.cl/ali-g-who-iz-i-2026-webrip-hindi-full-movie/');
  });

  it('tells whether a next page follows, by the next link of the pagination', async () => {
    assert.equal((await scrapeHdHub4uListing('https://new10.hdhub4u.cl/page/2/', answer(fixture('listing')))).hasNextPage, true);
    // The last page (live, 2026-10-31: 971) links the previous page, and no next one.
    const last = '<ul class="recent-movies"><li><figcaption><a href="/a/"><p>A</p></a></figcaption></li></ul>'
      + '<ul class="pagination"><li><a class="prev page-numbers" href="/page/970/">Previous</a></li><li><span aria-current="page" class="page-numbers current">971</span></li></ul>';
    assert.equal((await scrapeHdHub4uListing('https://new10.hdhub4u.cl/page/971/', answer(last))).hasNextPage, false);
  });

  it('is unrecognized for a page without posts', async () => {
    const url = 'https://new10.hdhub4u.cl/page/2/';
    await assert.rejects(scrapeHdHub4uListing(url, answer('<ul class="category-links"><a href="/category/x/">X</a></ul>')), { code: 'unrecognized', url });
  });
});

describe('searchHdHub4u', () => {
  const SITE = 'https://new10.hdhub4u.cl';
  const searchAnswer = readFileSync(new URL('../../fixtures/hdhub4u-search.json', import.meta.url), 'utf8');
  // A fake API: it answers with `body` and records the requests.
  const api = (body) => {
    const requests = [];
    return { requests, fetch: async (url, init) => { requests.push({ url: new URL(url), init }); return new Response(body); } };
  };

  it('gives the cards of the matching posts, as the search page shows them', async () => {
    const { posts, hasNextPage } = await searchHdHub4u(SITE, 'mirzapur', 1, api(searchAnswer));

    assert.equal(posts.length, 6);
    assert.deepEqual(posts[0], {
      url: 'https://new10.hdhub4u.cl/mirzapur-the-movie-2026-ds4k-webrip-hindi-full-movie/',
      title: 'Mirzapur: The Movie (2026) DS4K EXTENDED WEB-DL [Hindi DD5.1] 4K 1080p 720p & 480p [x264/10Bit-HEVC] | Full Movie',
      posterUrl: 'https://image.tmdb.org/t/p/w500/nIre9WOH2oa5I6tJxUhovNIupWD.jpg',
    });
    assert.equal(hasNextPage, false);
  });

  it('gives every post on the site\'s domain, as the search page links it', async () => {
    // The answer keeps the domain each post was published on: 5 of its 6 are on new2.hdhub4u.free.
    const { posts } = await searchHdHub4u(SITE, 'mirzapur', 1, api(searchAnswer));

    assert.deepEqual(new Set(posts.map(({ url }) => new URL(url).origin)), new Set([SITE]));
    assert.equal(posts[1].url, 'https://new10.hdhub4u.cl/mirzapur-the-movie-2026-hindi-telugu-orgs-v2-hdtc-full-movie/');
  });

  it('asks the API as the search page does, with the site as Referer', async () => {
    const options = api(searchAnswer);

    await searchHdHub4u(SITE, 'the boys', 2, options);

    const [{ url, init }] = options.requests;
    assert.equal(url.origin + url.pathname, 'https://search.pingora.fyi/collections/post/documents/search');
    assert.deepEqual([url.searchParams.get('q'), url.searchParams.get('page'), url.searchParams.get('limit')], ['the boys', '2', '15']);
    assert.equal(init.headers.Referer, 'https://new10.hdhub4u.cl/');
  });

  it('tells whether a next page follows, by how many posts match', async () => {
    const answerOf = (found, hits) => JSON.stringify({ found, page: 1, hits: Array.from({ length: hits }, () => ({ document: { permalink: `${SITE}/a/`, post_title: 'A' } })) });
    // 176 posts are 12 pages of 15: 11 full ones, and 11 posts on page 12.
    assert.equal((await searchHdHub4u(SITE, 'love', 11, api(answerOf(176, 15)))).hasNextPage, true);
    assert.equal((await searchHdHub4u(SITE, 'love', 12, api(answerOf(176, 11)))).hasNextPage, false);
    assert.equal((await searchHdHub4u(SITE, 'love', 12, api(answerOf(180, 15)))).hasNextPage, false);
  });

  it('gives no posts when nothing matches, and is notFound for a page after the last', async () => {
    const none = JSON.stringify({ found: 0, page: 1, hits: [] });
    assert.deepEqual(await searchHdHub4u(SITE, 'zzzqqqxxx', 1, api(none)), { posts: [], hasNextPage: false });
    await assert.rejects(searchHdHub4u(SITE, 'love', 99, api(JSON.stringify({ found: 176, page: 99, hits: [] }))), { code: 'notFound' });
  });

  it('is unrecognized for an answer without its hits', async () => {
    await assert.rejects(searchHdHub4u(SITE, 'love', 1, api('{"message":"Forbidden"}')), { code: 'unrecognized' });
  });
});
