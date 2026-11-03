import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { answer } from '../helpers.js';
import { scrapeVegamoviesListing, scrapeVegamoviesPost, searchVegamovies } from '../../../engine/providers/vegamovies.js';

// Live pages (2026-11-03): Vegamovies' movie (Spider-Man: Brand New Day, two sections of files),
// series (Dead-End Job: Watch Online, then a line of three servers per quality) and 2020 series
// (Sherlock: its seasons parted by rules alone); RogMovies' series in sections of episodes (Part
// Timers); both sites' listing page 2, and RogMovies' search answer for "mirzapur".
const fixture = (name) => readFileSync(new URL(`../../fixtures/${name}`, import.meta.url), 'utf8');
const VEGA_POST = 'https://vegamovies.lease/download-dead-end-job-2026-season-1-netflix-hindi-dubbed-org/';
// The sites, as the engine's providers hand them over (providers/index.js).
const VEGA = { id: 'vegamovies', name: 'Vegamovies' };
const ROG = { id: 'rogmovies', name: 'RogMovies' };
const shapeOf = (sections) => sections.map(({ title, lines }) => [title, lines.map((line) => [line.title, line.links.map(({ label }) => label)])]);
// A post page shaped like the live ones, its body `body`.
const postWith = (body) => `<h1 class="post-title">A Post (2020)</h1><main class="page-body">${body}</main>`;

describe('scrapeVegamoviesPost', () => {
  it('reads a post: its title and year, IMDb id, poster (og:image, past the image proxy) and publication time', async () => {
    const { post } = await scrapeVegamoviesPost(VEGA, VEGA_POST, answer(fixture('vegamovies-series.html')));

    assert.deepEqual(post, {
      provider: 'vegamovies',
      url: VEGA_POST,
      title: 'Download Dead-End Job (2026) Season 1 NetFlix : Dual Audio {Hindi-Korean} 480p HD 720p WEB-DL 1080p x264',
      year: 2026,
      imdbId: 'tt36458668',
      // og:image is on the site's image proxy, img.vegamovies.lease, gone: its `u` is the image.
      posterUrl: 'https://image.tmdb.org/t/p/original/4QA54CD2POmR42Nfv2n8v1dH3u.jpg',
      publishedAt: '2026-10-30T10:32:25.000Z',
    });
  });

  it('gives an og:image on any other host as it is', async () => {
    const page = '<meta property="og:image" content="https://vegamovies.lease/wp-content/uploads/2020/11/Sherlock.jpg"><h1 class="post-title">Sherlock</h1>';

    assert.equal((await scrapeVegamoviesPost(VEGA, VEGA_POST, answer(page))).post.posterUrl, 'https://vegamovies.lease/wp-content/uploads/2020/11/Sherlock.jpg');
    assert.equal((await scrapeVegamoviesPost(VEGA, VEGA_POST, answer('<h1 class="post-title">A</h1>'))).post.posterUrl, null);
  });

  it('gives each paragraph of buttons as a line titled by the heading over it; Watch Online, after a rule, untitled', async () => {
    const { sections } = await scrapeVegamoviesPost(VEGA, VEGA_POST, answer(fixture('vegamovies-series.html')));

    const servers = ['⚡ G-Direct [Instant]', '⚡ V-Cloud [Resumable]'];
    assert.deepEqual(shapeOf(sections), [
      [null, [[null, ['Watch Online']]]],
      [null, [
        ['Season 1 {Hindi-Korean} 480p WEB-DL x264 [160MB/E]', [...servers, '⚡ Batch/Zip [1.1GB]']],
        ['Season 1 {Hindi-Korean} 720p WEB-DL x264 [300MB/E]', [...servers, '⚡ Batch/Zip [2.3GB]']],
        ['Season 1 {Hindi-Korean} 1080p WEB-DL x264 [900MB/E]', [...servers, '⚡ Batch/Zip [6.8GB]']],
      ]],
    ]);
    assert.equal(sections[1].lines[0].links[0].url, 'https://nexdrive.beer/genxfm784776517502/');
    for (const section of sections) assert.deepEqual([section.tab, section.tags, section.episodes], [null, [], false]);
  });

  it('titles a section by a heading that only rules part from its lines: a movie\'s sources, a series\' episodes', async () => {
    const movie = await scrapeVegamoviesPost(VEGA, VEGA_POST, answer(fixture('vegamovies-movie.html')));
    const series = await scrapeVegamoviesPost(ROG, 'https://rogmovies.im/a/', answer(fixture('rogmovies-series.html')));

    assert.deepEqual(movie.sections.map(({ title, lines }) => [title, lines.length]), [['• iMAX – WEB-DL •', 5], ['• [ PrimeVideo ] •', 10]]);
    assert.deepEqual(movie.sections[0].lines[0].title, 'Spider-Man: Brand New Day (2026) {Hindi-English} 720p 10Bit iMAX-WEB-DL x265 [910MB]');
    assert.equal(series.sections.length, 10);
    assert.deepEqual(series.sections.map(({ title }) => title).slice(0, 2), ['• Episodes 37 TO 40 •', '• Episodes 33 TO 36 •']);
    assert.deepEqual(shapeOf(series.sections).at(-1)[1][0], ['Part Timers S01 Hindi – Telugu WEB-DL 480p x264 [540MB]', ['Download Now']]);
  });

  it('ends a section at a rule after its lines: a 2020 post\'s seasons, parted by rules alone', async () => {
    const { post, sections } = await scrapeVegamoviesPost(VEGA, VEGA_POST, answer(fixture('vegamovies-seasons.html')));

    assert.equal(post.publishedAt, '2020-11-01T10:08:49.000Z');
    assert.deepEqual(sections.map(({ title, lines }) => [title, lines.map((line) => line.title)]), [1, 2, 3, 4].map((season) => [null, [
      `Sherlock (Season ${season}) English 480p Esubs [300MB/E]`,
      `Sherlock (Season ${season}) English 720p Esubs [700MB]`,
    ]]));
  });

  it('gives no heading with anything but rules before the lines as their title, and no link in a sentence', async () => {
    const page = postWith(`
      <h3>Movie Info:</h3><p>IMDb Rating:- <a href="https://www.imdb.com/title/tt0000001/">7.0/10</a></p>
      <h2>Screenshots</h2><p><img src="https://imgbb.fit/a.jpg"></p><hr>
      <h5>A Post (2020) 480p [300MB]</h5><p><a href="https://nexdrive.beer/genxfm1/"><button>Download Now</button></a></p>
      <hr><h3>Winding Up</h3><p>Thank you, <a href="https://vegamovies.lease/">Vegamovies</a></p>`);

    const { post, sections } = await scrapeVegamoviesPost(VEGA, VEGA_POST, answer(page));

    assert.equal(post.imdbId, 'tt0000001');
    assert.deepEqual(shapeOf(sections), [[null, [['A Post (2020) 480p [300MB]', ['Download Now']]]]]);
  });

  it("gives a button to another post of the site as any: an English post's link to its Hindi one", async () => {
    const page = postWith('<h5>Season 1 {Hindi-English} 720p</h5><p><a href="https://vegamovies.lease/download-it-welcome-to-derry-2025-season-1-hindi-org-dubbed/"><button>Download Now</button></a></p>');

    const { sections } = await scrapeVegamoviesPost(VEGA, VEGA_POST, answer(page));

    assert.deepEqual(sections[0].lines[0].links, [{ url: 'https://vegamovies.lease/download-it-welcome-to-derry-2025-season-1-hindi-org-dubbed/', label: 'Download Now' }]);
  });

  it('is unrecognized for a page without the title, and notFound for a post the site does not have', async () => {
    await assert.rejects(scrapeVegamoviesPost(ROG, VEGA_POST, answer('<title>Just a moment...</title>')), { code: 'unrecognized', message: 'No title on the RogMovies post page' });
    await assert.rejects(scrapeVegamoviesPost(VEGA, VEGA_POST, answer('', { status: 404 })), { code: 'notFound' });
  });
});

describe('scrapeVegamoviesListing', () => {
  it('reads the grid\'s cards: Vegamovies\' poster from data-src, RogMovies\' from src', async () => {
    const vega = await scrapeVegamoviesListing(VEGA, 'https://vegamovies.lease/page/2/', answer(fixture('vegamovies-listing.html')));
    const rog = await scrapeVegamoviesListing(ROG, 'https://rogmovies.im/page/2/', answer(fixture('rogmovies-listing.html')));

    assert.deepEqual([vega.posts.length, vega.hasNextPage, rog.posts.length, rog.hasNextPage], [18, true, 20, true]);
    assert.deepEqual(vega.posts[0], {
      url: 'https://vegamovies.lease/download-final-table-season-1-hindi-dubbed-series-480p-720p-1080p-web-dl/',
      title: 'Download Final Table (Season 1) [S01 E04 Added] {Hindi-Korean} K-Drama Series 480p 720p & 1080p WEB-DL',
      posterUrl: 'https://image.tmdb.org/t/p/w500/uaMjtALuvZC7dGkYllGKKWEWW1J.jpg',
    });
    assert.equal(rog.posts[0].posterUrl, 'https://image.tmdb.org/t/p/w500/4LnYKxKHLXGHCEWCDcbuusB0DVf.jpg');
    for (const { posterUrl } of [...vega.posts, ...rog.posts]) assert.match(posterUrl, /^https:/);
  });

  it('has no next page on the last, is unrecognized for a page without cards, and notFound after the last', async () => {
    const last = '<div class="movies-grid"><a href="https://rogmovies.im/a/"><img src="https://image.tmdb.org/a.jpg"><p class="poster-title">A</p></a></div><nav class="pagination"><a class="prev-btn" href="https://rogmovies.im/page/396/"></a></nav>';

    assert.equal((await scrapeVegamoviesListing(ROG, 'https://rogmovies.im/page/397/', answer(last))).hasNextPage, false);
    await assert.rejects(scrapeVegamoviesListing(ROG, 'https://rogmovies.im/', answer('<div class="movies-grid"></div>')), { code: 'unrecognized' });
    await assert.rejects(scrapeVegamoviesListing(ROG, 'https://rogmovies.im/page/398/', answer('', { status: 404 })), { code: 'notFound' });
  });
});

describe('searchVegamovies', () => {
  it('asks the site\'s search API, and gives each hit\'s post on the site\'s domain', async () => {
    const asked = [];
    const options = { fetch: async (url) => (asked.push(url), new Response(fixture('rogmovies-search.json'))) };

    const { posts, hasNextPage } = await searchVegamovies(ROG, 'https://rogmovies.im', 'mirzapur', 1, options);

    assert.deepEqual(asked, ['https://rogmovies.im/ts-search.php?q=mirzapur&page=1']);
    assert.equal(posts.length, 4);
    assert.equal(hasNextPage, false);
    assert.deepEqual(posts[0], {
      url: 'https://rogmovies.im/download-mirzapur-the-movie-2026-hindi-full-movie-480p-720p-1080p-web-dl/',
      title: 'Download Mirzapur: The Movie (2026) PrimeVideo: {Hindi DD5.1} Full Movie WEB-DL 480p [500MB] | 720p [1.9GB] | 1080p [4.5GB] & 2160p [23.8GB] 4K-SDR',
      posterUrl: 'https://image.tmdb.org/t/p/w500/jbmZPjSfCdIHo269QZK203WZSm.jpg',
    });
  });

  it('has a next page while the pages so far hold fewer than it found; notFound after the last', async () => {
    const hits = (n) => Array.from({ length: n }, (_, i) => ({ document: { post_title: `P${i}`, permalink: `/p${i}/` } }));
    const json = (body) => answer(JSON.stringify(body));

    assert.equal((await searchVegamovies(VEGA, 'https://vegamovies.lease', 'a', 1, json({ found: 29, hits: hits(15), request_params: { per_page: 15 } }))).hasNextPage, true);
    assert.equal((await searchVegamovies(VEGA, 'https://vegamovies.lease', 'a', 2, json({ found: 29, hits: hits(14), request_params: { per_page: 15 } }))).hasNextPage, false);
    assert.deepEqual(await searchVegamovies(VEGA, 'https://vegamovies.lease', 'zzqq', 1, json({ found: 0, hits: [] })), { posts: [], hasNextPage: false });
    await assert.rejects(searchVegamovies(VEGA, 'https://vegamovies.lease', 'a', 3, json({ found: 29, hits: [] })), { code: 'notFound' });
    await assert.rejects(searchVegamovies(VEGA, 'https://vegamovies.lease', 'a', 1, json({ error: 'x' })), { code: 'unrecognized' });
  });
});
