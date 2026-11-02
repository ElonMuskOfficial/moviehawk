import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { answer } from '../helpers.js';
import { scrape4kHdHubListing, scrape4kHdHubPost, search4kHdHub } from '../../../src/engine/providers/4khdhub.js';

const MOVIE_URL = 'https://4khdhub.one/addicted-movie-7869/';
// Live pages (2026-10-31): a movie, a series (season packs and episodes, in 3 seasons' groups),
// listing page 2, and the search page for "dexter".
const fixture = (name) => readFileSync(new URL(`../../fixtures/4khdhub-${name}.html`, import.meta.url), 'utf8');

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

  it('gives a movie\'s block as a line: its title, its badges as tags, its file, its buttons by their server', async () => {
    const { sections } = await scrape4kHdHubPost(MOVIE_URL, answer(fixture('movie')));

    assert.deepEqual(sections.map(({ title, tab, tags }) => ({ title, tab, tags })), [{ title: 'Download Links', tab: null, tags: [] }]);
    const [line] = sections[0].lines;
    assert.deepEqual({ ...line, links: line.links.map(({ label }) => label) }, {
      title: 'Addicted (1080p WEB-DL H264 AVC)',
      file: 'Addicted.2014.1080p.AMZN.WEB-DL.English.DDP.5.1.x264-THR.mkv',
      tags: ['7 GB', 'English', 'WEB-DL'],
      links: ['Download HubCloud', 'Download HubDrive'],
    });
    for (const { url } of line.links) assert.match(url, /^https:\/\/greenmotors\.club\/\?id=/);
  });

  it('reads a series: its year from startDate, its packs and its seasons\' episodes, each in its tab', async () => {
    // "Download Individual Episodes" holds no block of its own: its seasons' groups do.
    const { post, sections } = await scrape4kHdHubPost('https://4khdhub.one/fallen-series-7872/', answer(fixture('series')));

    assert.equal(post.title, 'Fallen');
    assert.equal(post.year, 2024);
    // A season's group of episodes says it is one (.season-item); the packs' section does not.
    assert.deepEqual(sections.map(({ title, tab, tags, episodes, lines }) => [title, tab, tags, episodes, lines.length]), [
      ['Download Complete Season', 'Zip/Pack', [], false, 3],
      ['S01 AVC 1080p WEB-DL H264', "Single EP's", ['Episodes 8', 'English'], true, 8],
      ['S01 HEVC 1080p WEB-DL H265', "Single EP's", ['Episodes 8', 'English'], true, 8],
      ['S01 1080p WEB-DL AV1', "Single EP's", ['Episodes 8', 'English'], true, 8],
    ]);
    assert.deepEqual(sections[0].lines[0].tags, ['24.26 GB', 'English', 'WEB-DL']);
    const last = sections.at(-1).lines.at(-1);
    assert.deepEqual({ ...last, links: last.links.map(({ label }) => label) }, {
      title: 'Episode-08',
      file: last.file,
      tags: ['756.33 MB'],
      links: ['Download HubCloud', 'Download HubDrive'],
    });
    assert.match(last.file, /^Fallen\.S01E08\..+\.mkv$/);
  });

  it('gives the buttons of the blocks only, not the page\'s other links; a block before any section in a null one', async () => {
    const page = `<h1 class="page-title">Show</h1><a href="https://new10.hdhub4u.cl/">HDHub4U Team</a>
      <div class="download-item"><a href="https://greenmotors.club/?id=first">Download HubCloud</a></div>
      <div class="season-item"><h3 class="episode-title">S01</h3><div class="episode-download-item"><a href="https://greenmotors.club/?id=e1">Download HubCloud</a></div></div>
      <h2 class="section-title">You May Also Like</h2><a href="https://4khdhub.one/other-movie-1/">Other</a>`;

    const { sections } = await scrape4kHdHubPost(MOVIE_URL, answer(page));

    assert.deepEqual(sections.map(({ title, lines }) => [title, lines.flatMap(({ links }) => links.map(({ url }) => url))]), [
      [null, ['https://greenmotors.club/?id=first']],
      ['S01', ['https://greenmotors.club/?id=e1']],
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
  it('gives the cards of the grid, in page order: URL, title and poster', async () => {
    const { posts } = await scrape4kHdHubListing('https://4khdhub.one/page/2/', answer(fixture('listing')));

    assert.equal(posts.length, 18);
    assert.deepEqual(posts[0], {
      url: 'https://4khdhub.one/the-perfect-lie-series-8466/',
      title: 'The Perfect Lie',
      posterUrl: 'https://image.tmdb.org/t/p/w500/thXJkiBByDitV7iFSv1hU1sg7ij.jpg',
    });
    assert.equal(posts.at(-1).url, 'https://4khdhub.one/a-couple-of-lies-aka-bytet-series-8462/');
  });

  it('tells whether a next page follows, by the next link of the pagination', async () => {
    assert.equal((await scrape4kHdHubListing('https://4khdhub.one/page/2/', answer(fixture('listing')))).hasNextPage, true);
    // The last page (live, 2026-10-31: 407) links the previous page, and no next one.
    const last = '<div class="card-grid"><a href="/a-movie-1/"><h3 class="movie-card-title">A</h3></a></div>'
      + '<div class="pagination"><a href="/page/406/" class="pagination-item pagination-previous"></a><a class="pagination-item active">407</a></div>';
    assert.equal((await scrape4kHdHubListing('https://4khdhub.one/page/407/', answer(last))).hasNextPage, false);
  });

  it('is notFound for a page after the last, which 4KHDHub answers as its last', async () => {
    // Live (2026-10-31): /page/408/ has no posts, and its pagination marks 407 as the current page.
    const page = '<div class="card-grid"></div><div class="pagination"><a href="/page/1/" class="pagination-item">1</a><a class="pagination-item active">407</a></div>';
    const url = 'https://4khdhub.one/page/408/';

    await assert.rejects(scrape4kHdHubListing(url, answer(page)), { code: 'notFound', url });
  });

  it('is unrecognized for a page without posts', async () => {
    const url = 'https://4khdhub.one/page/2/';
    await assert.rejects(scrape4kHdHubListing(url, answer('<nav><a href="/category/movies/">Movies</a></nav>')), { code: 'unrecognized', url });
  });
});

describe('search4kHdHub', () => {
  const SITE = 'https://4khdhub.one';
  // A fake site: it answers with `body` and records the requests.
  const site = (body) => {
    const requests = [];
    return { requests, fetch: async (url) => { requests.push(url); return new Response(body); } };
  };

  it('gives the cards of the matching posts, from the search page', async () => {
    const { posts, hasNextPage } = await search4kHdHub(SITE, 'dexter', 1, site(fixture('search')));

    assert.equal(posts.length, 3);
    assert.equal(posts[0].title, 'Dexter');
    assert.match(posts[0].url, /^https:\/\/4khdhub\.one\/dexter-/);
    assert.equal(hasNextPage, false);
  });

  it('asks the search page as the search box does: "/?s=", then "/page/<n>/?s="', async () => {
    const options = site(fixture('search'));
    await search4kHdHub(SITE, 'the boys & girls', 1, options);
    await assert.rejects(search4kHdHub(SITE, 'dexter', 2, options), { code: 'notFound' });
    assert.deepEqual(options.requests, ['https://4khdhub.one/?s=the+boys+%26+girls', 'https://4khdhub.one/page/2/?s=dexter']);
  });

  it('gives no posts when nothing matches, and is unrecognized for a page without the grid', async () => {
    // Live (2026-10-31): an empty grid, and "Oops! No results Found".
    const none = '<div class="card-grid"></div><p>Oops! No results Found</p><div class="pagination"><a class="pagination-item active">1</a></div>';
    assert.deepEqual(await search4kHdHub(SITE, 'zzzqqqxxx', 1, site(none)), { posts: [], hasNextPage: false });
    await assert.rejects(search4kHdHub(SITE, 'love', 1, site('<html><title>Just a moment...</title></html>')), { code: 'unrecognized' });
  });
});
