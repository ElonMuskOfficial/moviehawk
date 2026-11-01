import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildApp } from '../../src/api/app.js';
import { EngineError } from '../../src/engine/index.js';

const domains = { hdhub4u: 'https://new10.hdhub4u.cl', '4khdhub': 'https://4khdhub.one' };

// An engine that answers each call with `answer`, and records how it was called.
function fakeEngine(answer) {
  const calls = [];
  const record = (name) => async (...args) => {
    calls.push([name, ...args]);
    return answer(...args);
  };
  return { engine: { scrapeListing: record('scrapeListing'), searchPosts: record('searchPosts'), scrapePost: record('scrapePost') }, calls };
}

async function app(engine) {
  const server = await buildApp({ engine, domains });
  await server.ready();
  return server;
}

const card = (url, title = 'A post') => ({ url, title, posterUrl: 'https://image.tmdb.org/t/p/w342/a.jpg' });

describe('ListSites', () => {
  it('names the sites the engine reads', async (t) => {
    const server = await app({});
    t.after(() => server.close());

    const response = await server.inject('/v1/sites');

    assert.deepEqual(response.json(), { sites: [{ name: 'sites/hdhub4u' }, { name: 'sites/4khdhub' }] });
  });
});

describe('ListPosts', () => {
  it('reads the site\'s first page on its current domain, and names each post by its slug', async (t) => {
    const { engine, calls } = fakeEngine(() => ({
      posts: [card('https://new10.hdhub4u.cl/akka-season-1-hindi-webrip-full-series/', 'Akka (Season 1)')],
      hasNextPage: true,
    }));
    const server = await app(engine);
    t.after(() => server.close());

    const response = await server.inject('/v1/sites/hdhub4u/posts');

    assert.deepEqual(calls, [['scrapeListing', 'https://new10.hdhub4u.cl', 1]]);
    assert.deepEqual(response.json(), {
      posts: [{
        name: 'sites/hdhub4u/posts/akka-season-1-hindi-webrip-full-series',
        title: 'Akka (Season 1)',
        posterUrl: 'https://image.tmdb.org/t/p/w342/a.jpg',
      }],
      nextPageToken: '2',
    });
  });

  it('reads the page its pageToken names, and gives no nextPageToken on the last page', async (t) => {
    const { engine, calls } = fakeEngine(() => ({ posts: [card('https://4khdhub.one/ali-g-who-iz-i-movie-8435/')], hasNextPage: false }));
    const server = await app(engine);
    t.after(() => server.close());

    const response = await server.inject('/v1/sites/4khdhub/posts?pageToken=407');

    assert.deepEqual(calls, [['scrapeListing', 'https://4khdhub.one', 407]]);
    assert.equal(response.json().posts[0].name, 'sites/4khdhub/posts/ali-g-who-iz-i-movie-8435');
    assert.equal('nextPageToken' in response.json(), false);
  });

  it('names a post whose slug the site percent-encodes by the decoded slug', async (t) => {
    const { engine } = fakeEngine(() => ({
      posts: [card('https://new10.hdhub4u.cl/wall%c2%b7e-2008-hindi-bluray-full-movie/'), card('https://new10.hdhub4u.cl/jung_e-2023-hindi-webrip-full-movie/')],
      hasNextPage: true,
    }));
    const server = await app(engine);
    t.after(() => server.close());

    const response = await server.inject('/v1/sites/hdhub4u/posts');

    assert.deepEqual(response.json().posts.map((post) => post.name), [
      'sites/hdhub4u/posts/wall·e-2008-hindi-bluray-full-movie',
      'sites/hdhub4u/posts/jung_e-2023-hindi-webrip-full-movie',
    ]);
  });

  it('gives a page after the last as the engine\'s 404', async (t) => {
    const { engine } = fakeEngine(() => {
      throw new EngineError('notFound', 'HTTP 404', { url: 'https://new10.hdhub4u.cl/page/99999/', status: 404 });
    });
    const server = await app(engine);
    t.after(() => server.close());

    const response = await server.inject('/v1/sites/hdhub4u/posts?pageToken=99999');

    assert.equal(response.statusCode, 404);
    assert.equal(response.json().code, 'notFound');
  });

  it('gives a site it does not have as 404, and asks the engine nothing', async (t) => {
    const { engine, calls } = fakeEngine(() => ({ posts: [], hasNextPage: false }));
    const server = await app(engine);
    t.after(() => server.close());

    const response = await server.inject('/v1/sites/vegamovies/posts');

    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.json(), { type: 'about:blank', title: 'Not Found', status: 404, detail: 'No site vegamovies', code: 'notFound' });
    assert.deepEqual(calls, []);
  });

  it('gives a pageToken that is not a page number as 400, and asks the engine nothing', async (t) => {
    const { engine, calls } = fakeEngine(() => ({ posts: [], hasNextPage: false }));
    const server = await app(engine);
    t.after(() => server.close());

    for (const token of ['0', '-1', '2.5', 'abc', '1234567']) {
      const response = await server.inject(`/v1/sites/hdhub4u/posts?pageToken=${token}`);
      assert.equal(response.statusCode, 400, token);
      assert.equal(response.json().code, 'invalidArgument', token);
    }
    assert.deepEqual(calls, []);
  });
});

describe('SearchPosts', () => {
  it('searches the site for q, on the page its pageToken names', async (t) => {
    const { engine, calls } = fakeEngine(() => ({
      posts: [card('https://new10.hdhub4u.cl/dexter-resurrection-season-2-hindi-webrip-all-episodes/', 'Dexter: Resurrection (Season 2)')],
      hasNextPage: true,
    }));
    const server = await app(engine);
    t.after(() => server.close());

    const response = await server.inject('/v1/sites/hdhub4u/search?q=dexter%20resurrection&pageToken=2');

    assert.deepEqual(calls, [['searchPosts', 'https://new10.hdhub4u.cl', 'dexter resurrection', 2]]);
    assert.deepEqual(response.json(), {
      posts: [{
        name: 'sites/hdhub4u/posts/dexter-resurrection-season-2-hindi-webrip-all-episodes',
        title: 'Dexter: Resurrection (Season 2)',
        posterUrl: 'https://image.tmdb.org/t/p/w342/a.jpg',
      }],
      nextPageToken: '3',
    });
  });

  it('gives a search that matches nothing as no posts', async (t) => {
    const { engine } = fakeEngine(() => ({ posts: [], hasNextPage: false }));
    const server = await app(engine);
    t.after(() => server.close());

    const response = await server.inject('/v1/sites/4khdhub/search?q=zzqxnonexist');

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { posts: [] });
  });

  it('gives a search without q as 400, and asks the engine nothing', async (t) => {
    const { engine, calls } = fakeEngine(() => ({ posts: [], hasNextPage: false }));
    const server = await app(engine);
    t.after(() => server.close());

    for (const url of ['/v1/sites/hdhub4u/search', '/v1/sites/hdhub4u/search?q=']) {
      const response = await server.inject(url);
      assert.equal(response.statusCode, 400, url);
      assert.equal(response.json().code, 'invalidArgument', url);
    }
    assert.deepEqual(calls, []);
  });
});

describe('GetPost', () => {
  const wrongTurn = {
    post: {
      provider: 'hdhub4u',
      url: 'https://new10.hdhub4u.cl/wrong-turn-2003-hindi-bluray-full-movie/',
      title: 'Wrong Turn (2003) BluRay [Hindi (DD5.1) & English] 1080p 720p & 480p Dual Audio [x264] | Full Movie',
      year: 2003,
      imdbId: 'tt0295700',
      posterUrl: 'https://imgshare.info/images/2026/08/19/Wrong-Turn-2003.jpg',
      publishedAt: '2026-08-19T04:16:42.000Z',
    },
    links: [
      { url: 'https://greenmotors.club/?id=cUk4cEpVbFU1NW8yUVR1ZVFUM3phNm5QS2Z3TTdCSkVpS1pqdjdkTHQ5bDlqUGNSMTVIWDk5d05BZDVIa3R2QnpzaG9sUGlWYWgyY3A5eVRVeVBaTlVwYVVuUkxNZXZBRG9rbDZqQldYWmc9', label: '720p x264 [850MB]' },
      { url: 'https://hblinks.lol/archives/121857', label: 'EPiSODE 1 720p · Drive' },
    ],
  };

  it("reads the post its name names, on its site's current domain, and names each link by its URL", async (t) => {
    const { engine, calls } = fakeEngine(() => wrongTurn);
    const server = await app(engine);
    t.after(() => server.close());

    const response = await server.inject('/v1/sites/hdhub4u/posts/wrong-turn-2003-hindi-bluray-full-movie');

    assert.deepEqual(calls, [['scrapePost', 'https://new10.hdhub4u.cl/wrong-turn-2003-hindi-bluray-full-movie/']]);
    assert.deepEqual(response.json(), {
      name: 'sites/hdhub4u/posts/wrong-turn-2003-hindi-bluray-full-movie',
      url: 'https://new10.hdhub4u.cl/wrong-turn-2003-hindi-bluray-full-movie/',
      title: wrongTurn.post.title,
      year: 2003,
      imdbId: 'tt0295700',
      posterUrl: wrongTurn.post.posterUrl,
      publishTime: '2026-08-19T04:16:42.000Z',
      links: [
        { name: `links/${Buffer.from(wrongTurn.links[0].url).toString('base64url')}`, label: '720p x264 [850MB]' },
        { name: 'links/aHR0cHM6Ly9oYmxpbmtzLmxvbC9hcmNoaXZlcy8xMjE4NTc', label: 'EPiSODE 1 720p · Drive' },
      ],
    });
    assert.equal(Buffer.from(response.json().links[0].name.slice('links/'.length), 'base64url').toString(), wrongTurn.links[0].url);
  });

  it('makes the URL of a post whose slug is not plain ASCII again, from the decoded name', async (t) => {
    const { engine, calls } = fakeEngine((url) => ({ post: { ...wrongTurn.post, url }, links: [] }));
    const server = await app(engine);
    t.after(() => server.close());

    // As a client sends the name sites/hdhub4u/posts/wall·e-2008-hindi-bluray-full-movie.
    const response = await server.inject('/v1/sites/hdhub4u/posts/wall%C2%B7e-2008-hindi-bluray-full-movie');

    assert.deepEqual(calls, [['scrapePost', 'https://new10.hdhub4u.cl/wall%C2%B7e-2008-hindi-bluray-full-movie/']]);
    assert.equal(response.json().name, 'sites/hdhub4u/posts/wall·e-2008-hindi-bluray-full-movie');
  });

  it('names a post by the URL the site answered at, when it moved the post', async (t) => {
    const { engine } = fakeEngine(() => ({ post: { ...wrongTurn.post, url: 'https://new10.hdhub4u.cl/wrong-turn-2003-new-slug/' }, links: [] }));
    const server = await app(engine);
    t.after(() => server.close());

    const response = await server.inject('/v1/sites/hdhub4u/posts/wrong-turn-2003-hindi-bluray-full-movie');

    assert.equal(response.json().name, 'sites/hdhub4u/posts/wrong-turn-2003-new-slug');
  });

  it('gives a post the site says is gone as 404, and a post of a site it does not have as 404 without asking', async (t) => {
    const { engine, calls } = fakeEngine(() => {
      throw new EngineError('notFound', '4KHDHub says the post does not exist', { url: 'https://4khdhub.one/the-strangers-chapter-3-movie-6020/' });
    });
    const server = await app(engine);
    t.after(() => server.close());

    const gone = await server.inject('/v1/sites/4khdhub/posts/the-strangers-chapter-3-movie-6020');
    const noSite = await server.inject('/v1/sites/rogmovies/posts/download-akka-2026-season-1-hindi-dubbed-org');

    assert.equal(gone.statusCode, 404);
    assert.equal(gone.json().detail, '4KHDHub says the post does not exist');
    assert.equal(noSite.statusCode, 404);
    assert.equal(noSite.json().detail, 'No site rogmovies');
    assert.equal(calls.length, 1);
  });
});
