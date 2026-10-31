import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { scrapeHdHub4uListing, scrapeHdHub4uPost } from '../../../src/engine/providers/hdhub4u.js';

const MOVIE_URL = 'https://new10.hdhub4u.cl/wrong-turn-2003-hindi-bluray-full-movie/';
// Live pages (2026-10-31): a movie, a series that links TMDB instead of IMDb, and listing page 2.
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
  it('gives each post of the grid once, in page order', async () => {
    const { postUrls } = await scrapeHdHub4uListing('https://new10.hdhub4u.cl/page/2/', answer(fixture('listing')));

    assert.equal(postUrls.length, 15);
    assert.equal(postUrls[0], 'https://new10.hdhub4u.cl/dont-trouble-the-trouble-2026-webrip-hindi-full-movie/');
    assert.equal(postUrls.at(-1), 'https://new10.hdhub4u.cl/ali-g-who-iz-i-2026-webrip-hindi-full-movie/');
  });

  it('is unrecognized for a page without posts', async () => {
    const url = 'https://new10.hdhub4u.cl/page/2/';
    await assert.rejects(scrapeHdHub4uListing(url, answer('<ul class="category-links"><a href="/category/x/">X</a></ul>')), { code: 'unrecognized', url });
  });
});
