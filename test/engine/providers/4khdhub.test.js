import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { scrape4kHdHubListing, scrape4kHdHubPost } from '../../../src/engine/providers/4khdhub.js';

const MOVIE_URL = 'https://4khdhub.one/addicted-movie-7869/';
// Live pages (2026-10-31): a movie, a series (season packs and episodes), and listing page 2.
const fixture = (name) => readFileSync(new URL(`../../fixtures/4khdhub-${name}.html`, import.meta.url), 'utf8');
const answer = (body, status = 200) => ({ fetch: async () => new Response(body, { status }) });
const badge = (text, colour) => `<span class="badge" style="background-color: ${colour}; color: white;">${text}</span>`;

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

  it('gives every block\'s buttons with the languages its badge states', async () => {
    const { links } = await scrape4kHdHubPost(MOVIE_URL, answer(fixture('movie')));

    assert.equal(links.length, 2);
    for (const { url, statedLanguages } of links) {
      assert.match(url, /^https:\/\/greenmotors\.club\/\?id=/);
      assert.equal(statedLanguages, 'English');
    }
  });

  it('reads a series: its year from startDate, and the buttons of its packs and episodes', async () => {
    const { post, links } = await scrape4kHdHubPost('https://4khdhub.one/fallen-series-7872/', answer(fixture('series')));

    assert.equal(post.title, 'Fallen');
    assert.equal(post.year, 2024);
    assert.equal(links.length, 54);
    assert.ok(links.every(({ statedLanguages }) => statedLanguages === 'English'));
  });

  it('takes an episode\'s languages from its season, and only the languages badge', async () => {
    const page = `<h1 class="page-title">Show</h1>
      <div class="season-item"><div class="episode-meta">${badge('Episodes 2', '#ea580c')}${badge('Hindi, Korean', '#0d9488')}</div>
        <div class="episode-download-item"><a href="https://greenmotors.club/?id=e1">Download HubCloud</a></div></div>
      <div class="download-item">${badge('7 GB', '#ea580c')}${badge('WEB-DL', '#15803d')}
        <a href="https://greenmotors.club/?id=pack">Download HubCloud</a></div>`;

    const { links } = await scrape4kHdHubPost(MOVIE_URL, answer(page));

    assert.deepEqual(links, [
      { url: 'https://greenmotors.club/?id=e1', statedLanguages: 'Hindi, Korean' },
      { url: 'https://greenmotors.club/?id=pack', statedLanguages: null },
    ]);
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
