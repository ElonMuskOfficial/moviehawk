import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { scrape4kHdHubListing, scrape4kHdHubPost } from '../../../src/engine/providers/4khdhub.js';

const MOVIE_URL = 'https://4khdhub.one/addicted-movie-7869/';
// Live pages (2026-10-31): a movie, a series (season packs and episodes), and listing page 2.
const fixture = (name) => readFileSync(new URL(`../../fixtures/4khdhub-${name}.html`, import.meta.url), 'utf8');
const answer = (body, status = 200) => ({ fetch: async () => new Response(body, { status }) });

describe('scrape4kHdHubPost', () => {
  it('reads a movie post: title, year and poster; the page states no date and no IMDb id', async () => {
    const { post } = await scrape4kHdHubPost(MOVIE_URL, answer(fixture('movie')));

    assert.deepEqual(post, {
      provider: '4khdhub',
      url: MOVIE_URL,
      title: 'Addicted (2014)',
      year: 2014,
      imdbId: null,
      posterUrl: 'https://image.tmdb.org/t/p/w500/fAERrD6vvmznDoL99wlgjhSfPcH.jpg',
      publishedAt: null,
    });
  });

  it('gives every block\'s buttons, in page order', async () => {
    const { links } = await scrape4kHdHubPost(MOVIE_URL, answer(fixture('movie')));

    assert.deepEqual(links.map(({ label }) => label), ['Download HubCloud', 'Download HubDrive']);
    for (const { url } of links) assert.match(url, /^https:\/\/greenmotors\.club\/\?id=/);
  });

  it('reads a series: its year from startDate, and the buttons of its packs and episodes', async () => {
    const { post, links } = await scrape4kHdHubPost('https://4khdhub.one/fallen-series-7872/', answer(fixture('series')));

    assert.equal(post.title, 'Fallen');
    assert.equal(post.year, 2024);
    assert.equal(links.length, 54);
  });

  it('gives the buttons of the blocks only, not the page\'s other links', async () => {
    const page = `<h1 class="page-title">Show</h1><a href="https://new10.hdhub4u.cl/">HDHub4U Team</a>
      <div class="season-item"><div class="episode-download-item"><a href="https://greenmotors.club/?id=e1">Download HubCloud</a></div></div>
      <div class="download-item"><a href="https://greenmotors.club/?id=pack">Download HubCloud</a></div>`;

    const { links } = await scrape4kHdHubPost(MOVIE_URL, answer(page));

    assert.deepEqual(links.map(({ url }) => url), ['https://greenmotors.club/?id=e1', 'https://greenmotors.club/?id=pack']);
  });

  it('is notFound for 4KHDHub\'s answer to a post it does not have', async () => {
    const missing = '{"success":false,"message":"TMDB ID is required"}';
    await assert.rejects(scrape4kHdHubPost(MOVIE_URL, answer(missing)), { code: 'notFound', url: MOVIE_URL });
  });

  it('is unrecognized for a page without the post\'s title', async () => {
    for (const page of ['<html><title>Just a moment...</title></html>', '{"success":true}']) {
      await assert.rejects(scrape4kHdHubPost(MOVIE_URL, answer(page)), { code: 'unrecognized', url: MOVIE_URL });
    }
  });
});

describe('scrape4kHdHubListing', () => {
  it('gives the posts of the grid, in page order', async () => {
    const { postUrls } = await scrape4kHdHubListing('https://4khdhub.one/page/2/', answer(fixture('listing')));

    assert.equal(postUrls.length, 18);
    assert.equal(postUrls[0], 'https://4khdhub.one/the-perfect-lie-series-8466/');
    assert.equal(postUrls.at(-1), 'https://4khdhub.one/a-couple-of-lies-aka-bytet-series-8462/');
  });

  it('is unrecognized for a page without posts', async () => {
    const url = 'https://4khdhub.one/page/2/';
    await assert.rejects(scrape4kHdHubListing(url, answer('<nav><a href="/category/movies/">Movies</a></nav>')), { code: 'unrecognized', url });
  });
});
