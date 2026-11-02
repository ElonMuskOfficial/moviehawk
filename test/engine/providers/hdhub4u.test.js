import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { answer } from '../helpers.js';
import { scrapeHdHub4uListing, scrapeHdHub4uPost, searchHdHub4u } from '../../../src/engine/providers/hdhub4u.js';

const MOVIE_URL = 'https://new10.hdhub4u.cl/wrong-turn-2003-hindi-bluray-full-movie/';
// Live pages (2026-10-31): a movie, a series that links TMDB instead of IMDb, and listing page 2;
// and the search API's answer for "mirzapur". Live pages (2026-11-02): a 2022 post whose buttons lead
// to sugarke.com, a post with the site's promo and genre links, a 2019 post with links in paragraphs.
const fixture = (name) => readFileSync(new URL(`../../fixtures/hdhub4u-${name}.html`, import.meta.url), 'utf8');
const hostnamesOf = (links) => links.map(({ url }) => new URL(url).hostname);
const linksOf = (sections) => sections.flatMap(({ lines }) => lines.flatMap(({ links }) => links));

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

  it('groups the download buttons as the page does: a heading with buttons is a line', async () => {
    // Left out: the promo in the first paragraph, "[How To Download]", WhatsApp, IMDb's rating.
    const { sections } = await scrapeHdHub4uPost(MOVIE_URL, answer(fixture('movie')));

    assert.deepEqual(sections.map(({ title }) => title), [': DOWNLOAD LINKS :']);
    assert.deepEqual(hostnamesOf(linksOf(sections)), ['greenmotors.club', 'greenmotors.club', 'greenmotors.club', 'hubdrive.bar', 'greenmotors.club']);
  });

  it('titles a button alone in its heading with its own text, as its label', async () => {
    const { sections } = await scrapeHdHub4uPost(MOVIE_URL, answer(fixture('movie')));

    assert.deepEqual(sections[0].lines.map(({ title, links }) => [title, links.map(({ label }) => label)]), [
      ['480p⚡[320MB]', ['480p⚡[320MB]']], ['720p x264 [850MB]', ['720p x264 [850MB]']],
      ['1080p x264 [1.7GB]', ['1080p x264 [1.7GB]']], ['1080p BluRay [20.42GB]', ['1080p BluRay [20.42GB]']],
      ['Watch Online', ['Watch Online']],
    ]);
  });

  it('makes each heading without links the title of the lines under it: an episode is a section', async () => {
    // The series' ": Single Episode x264 Links :" has no line of its own: its episodes do.
    const { sections } = await scrapeHdHub4uPost(MOVIE_URL, answer(fixture('series')));

    assert.deepEqual(sections.map(({ title }) => title), [': DOWNLOAD LINKS :', 'EPiSODE 1', 'EPiSODE 2', 'EPiSODE 3']);
    assert.deepEqual(sections[1].lines.map(({ title, links }) => [title, links.map(({ label }) => label)]), [
      ['720p', ['Drive', 'Instant', 'WATCH']],
      ['1080p', ['Drive', 'Instant']],
    ]);
  });

  it('gives a button to a host the engine does not know, as any other', async () => {
    // Main Te Bapu (2022), live 2026-11-02: every button leads to sugarke.com. The last line's
    // separators are inside its buttons' text, and stay in their labels.
    const { sections } = await scrapeHdHub4uPost(MOVIE_URL, answer(fixture('sugarke')));

    assert.deepEqual(sections[0].lines.map(({ title, links }) => [title, links.map(({ label }) => label)]), [
      ['480p [300MB]', ['Instant', 'HubDrive', 'GDTOT']],
      ['720p [1GB]', ['Instant', 'HubDrive', 'GDTOT']],
      ['1080p [1.97GB]', ['Instant', '|HubDrive', '|GDTOT']],
    ]);
    assert.deepEqual(new Set(hostnamesOf(linksOf(sections))), new Set(['sugarke.com']));
  });

  it('leaves out the site\'s promo, its genres and the screenshots, which GreenMotors leads to', async () => {
    // Beirut (2018), live 2026-11-02: "HDHub4u" in the first paragraph (the site's home page),
    // "Genre: Action | Crime" (a category page), the screenshots (images), then four buttons.
    const { sections } = await scrapeHdHub4uPost(MOVIE_URL, answer(fixture('promo')));

    assert.deepEqual(linksOf(sections).map(({ label }) => label), ['480p Links [350MB]', '720p Links [1GB]', '1080p Links [1.9GB]', '1080p Links [Untouch]']);
  });

  it('reads an old post\'s servers, each a paragraph of its own, under its headings', async () => {
    // Drive (2011), posted in 2019, live 2026-11-02: its servers (9xplay, Openload, ClickNupload,
    // ...) are links alone in their paragraphs, to hosts the engine does not know.
    const { sections } = await scrapeHdHub4uPost(MOVIE_URL, answer(fixture('prose')));

    assert.deepEqual(sections.map(({ title, lines }) => [title, lines.map(({ title: line, links }) => [line, links.map(({ label }) => label)])]), [
      ['Watch Online', [['9xplay', ['9xplay']], ['Openload.co', ['Openload.co']], ['LINKSTAKER HIGH SPEED', ['LINKSTAKER HIGH SPEED']]]],
      ['Download Links', [
        ['Torrent Link', ['Torrent Link']], ['LINKSTAKER DIRECT FAST', ['LINKSTAKER DIRECT FAST']], ['Indishare.me', ['Indishare.me']],
        ['ClickNupload', ['ClickNupload']], ['uploadBaz', ['uploadBaz']], ['Openload', ['Openload']], ['More Download Links', ['More Download Links']],
      ]],
    ]);
  });

  it('leaves out a link in a heading to the site on any domain, an image, and no web URL', async () => {
    const page = `<h1 class="page-title"><span class="material-text">Show</span></h1><main class="page-body">
      <h2><a href="/how-to-download/">[How To Download]</a></h2>
      <h4><a href="https://hdhub4u.gratis/show-season-1/">DOWNLOAD S01 HERE</a></h4>
      <h3><a href="https://greenmotors.club/?id=1"><img src="https://extraimage.net/a.jpg"></a></h3>
      <h3><a href="hhttps://hubdrive.bar/file/1">720p</a></h3>
      <h3><a href="https://streamwire.net/e/a">Watch Online</a></h3></main>`;

    const { sections } = await scrapeHdHub4uPost(MOVIE_URL, answer(page));

    assert.deepEqual(sections, [{
      title: null,
      lines: [{ title: 'Watch Online', links: [{ url: 'https://streamwire.net/e/a', label: 'Watch Online' }], file: null, tags: [] }],
      tab: null,
      tags: [],
      episodes: false,
    }]);
  });

  it('titles no line of buttons only, and starts no section at a heading with links but no button, or empty', async () => {
    // Shapes of live posts (2026-10-31): an episode's line right under the ": DOWNLOAD LINKS :" box,
    // a movie's players, a heading of screenshots, an empty heading, and a link in the post's prose.
    const page = `<h1 class="page-title"><span class="material-text">Show</span></h1><main class="page-body">
      <h2>: DOWNLOAD LINKS :</h2><h3><a href="https://greenmotors.club/?id=1">EPiSODE 1</a> | <a href="https://hubstream.art/#a">WATCH</a></h3>
      <h3><a href="https://greenmotors.club/?id=3"><img src="https://extraimage.net/a.jpg"></a></h3><h4> </h4>
      <hr><h4><a href="https://hdstream4u.com/file/b">WATCH</a> | <a href="https://hubstream.art/#c">PLAYER-2</a></h4>
      <p>Download Show in Hindi <a href="https://greenmotors.club/?id=2">HDHub4u</a></p></main>`;

    const { sections } = await scrapeHdHub4uPost(MOVIE_URL, answer(page));

    assert.deepEqual(sections.map(({ title, lines }) => [title, lines.map((line) => [line.title, line.links.map(({ label }) => label)])]), [
      [': DOWNLOAD LINKS :', [[null, ['EPiSODE 1', 'WATCH']], [null, ['WATCH', 'PLAYER-2']]]],
    ]);
  });

  it('names a player that is only its number as the player before it', async () => {
    // The Great Indian Kapil Show S05 (live, 2026-11-01): "EPiSODE 1 | WATCH-1 | 2". A number that
    // follows no player keeps its text.
    const page = `<h1 class="page-title"><span class="material-text">Show</span></h1><main class="page-body">
      <h3><a href="https://greenmotors.club/?id=1">EPiSODE 1</a> | <a href="https://vidaraa.cc/e/a">WATCH-1</a> | <a href="https://hdstream4u.com/file/b"><span>2</span></a></h3>
      <h3><a href="https://greenmotors.club/?id=2">EPiSODE 2</a> | <a href="https://hdstream4u.com/file/c">2</a></h3></main>`;

    const { sections } = await scrapeHdHub4uPost(MOVIE_URL, answer(page));

    assert.deepEqual(linksOf(sections).map(({ label }) => label), ['EPiSODE 1', 'WATCH-1', 'WATCH-2', 'EPiSODE 2', '2']);
  });

  it('has no year and no IMDb id for a series that links TMDB in IMDb\'s box', async () => {
    const { post, sections } = await scrapeHdHub4uPost('https://new10.hdhub4u.cl/s/', answer(fixture('series')));

    assert.equal(post.year, null);
    assert.equal(post.imdbId, null);
    assert.equal(post.publishedAt, '2026-10-31T08:32:59.000Z');
    assert.equal(linksOf(sections).length, 21);
  });

  it('reads the JSON-LD past a script that is not JSON', async () => {
    const page = `<script type="application/ld+json">{"@type": "BlogPosting",}</script>
      <script type="application/ld+json">{"@type": "BlogPosting", "datePublished": "2026-10-31T08:32:59+00:00"}</script>
      <h1 class="page-title"><span class="material-text">Show</span></h1><main class="page-body"></main>`;

    const { post } = await scrapeHdHub4uPost(MOVIE_URL, answer(page));

    assert.equal(post.publishedAt, '2026-10-31T08:32:59.000Z');
  });

  it('states no publication time for a date that is none', async () => {
    const page = `<script type="application/ld+json">{"@type": "BlogPosting", "datePublished": "yesterday"}</script>
      <h1 class="page-title"><span class="material-text">Show</span></h1><main class="page-body"></main>`;

    const { post } = await scrapeHdHub4uPost(MOVIE_URL, answer(page));

    assert.equal(post.publishedAt, null);
  });

  it('is unrecognized for a page without the post\'s title', async () => {
    const page = '<html><title>Just a moment...</title><body>Checking your browser</body></html>';
    await assert.rejects(scrapeHdHub4uPost(MOVIE_URL, answer(page)), { code: 'unrecognized', url: MOVIE_URL });
  });

  it('is notFound when HDHub4u answers HTTP 404, as it does for a missing post', async () => {
    await assert.rejects(scrapeHdHub4uPost(MOVIE_URL, answer('Page not found', { status: 404 })), { code: 'notFound' });
  });
});

describe('scrapeHdHub4uListing', () => {
  it('gives the cards of the grid, in page order: URL, title and poster', async () => {
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
    await assert.rejects(searchHdHub4u(SITE, 'love', 99, api(JSON.stringify({ found: 176, page: 99, hits: [] }))), {
      code: 'notFound',
      message: 'HDHub4u says page 99 does not exist (its last is 12)',
    });
  });

  it('is unrecognized for an answer without its hits', async () => {
    await assert.rejects(searchHdHub4u(SITE, 'love', 1, api('{"message":"Forbidden"}')), { code: 'unrecognized' });
  });

  it('is unrecognized for a hit without its post\'s link or title', async () => {
    for (const document of [{ post_title: 'A' }, { permalink: '/a/', post_title: 'A' }, { permalink: `${SITE}/a/` }]) {
      const hits = JSON.stringify({ found: 1, page: 1, hits: [{ document }] });
      await assert.rejects(searchHdHub4u(SITE, 'love', 1, api(hits)), { code: 'unrecognized' }, JSON.stringify(document));
    }
  });
});
