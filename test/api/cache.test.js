import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EngineError } from '../../src/engine/index.js';
import { appWith as app, fakeEngine } from './helpers.js';

const id = (url) => Buffer.from(url).toString('base64url');
const FILE = `/v1/files/${id('https://hubcloud.ist/drive/a')}`;
const LINK = `/v1/links/${id('https://hblinks.lol/archives/1')}/files`;

// An engine that answers each function as the test says.
const answers = {
  scrapeListing: () => ({ posts: [], hasNextPage: false }),
  searchPosts: () => ({ posts: [], hasNextPage: false }),
  scrapePost: () => ({ post: { url: 'https://new10.hdhub4u.cl/show/', title: 'Show', year: null, imdbId: null, posterUrl: null, publishedAt: null }, links: [] }),
  scrapeLinks: () => ({ files: [], failures: [] }),
  resolve: () => ({ filename: 'a.mkv', sizeBytes: 1, downloads: [] }),
};
const engineFor = () => {
  const fake = fakeEngine(() => {});
  for (const name of Object.keys(answers)) {
    const call = fake.engine[name];
    fake.engine[name] = async (...args) => {
      await call(...args);
      return answers[name]();
    };
  }
  return fake;
};

describe('the cache', () => {
  it('answers a repeat without asking the engine, and tells the client for how long', async (t) => {
    const { engine, calls } = engineFor();
    const server = await app(engine);
    t.after(() => server.close());
    const routes = {
      '/v1/sites/hdhub4u/posts': 300,
      '/v1/sites/hdhub4u/search?q=dexter': 600,
      '/v1/sites/hdhub4u/posts/show': 900,
      [LINK]: 3600,
      [FILE]: 300,
    };

    for (const [url, maxAge] of Object.entries(routes)) {
      const first = await server.inject(url);
      const repeat = await server.inject(url);
      assert.equal(first.statusCode, 200, url);
      assert.deepEqual(repeat.json(), first.json(), url);
      // The time left, rounded down: the full time, or a second less once the clock moved.
      assert.ok([`public, max-age=${maxAge}`, `public, max-age=${maxAge - 1}`].includes(first.headers['cache-control']), url);
      assert.match(repeat.headers['cache-control'], /^public, max-age=\d+$/, url);
    }
    assert.equal(calls.length, Object.keys(routes).length);
  });

  it('keeps each URL apart: another page or query is read', async (t) => {
    const { engine, calls } = engineFor();
    const server = await app(engine);
    t.after(() => server.close());

    for (const url of ['/v1/sites/hdhub4u/posts', '/v1/sites/hdhub4u/posts?pageToken=2', '/v1/sites/4khdhub/posts']) await server.inject(url);

    assert.equal(calls.length, 3);
  });

  it('keeps no error: the next request asks the engine again', async (t) => {
    let tries = 0;
    const { engine, calls } = fakeEngine(() => {
      if (++tries === 1) throw new EngineError('transient', 'hubcloud.ist did not answer within 8000 ms');
      return { filename: 'a.mkv', sizeBytes: 1, downloads: [] };
    });
    const server = await app(engine);
    t.after(() => server.close());

    const failed = await server.inject(FILE);
    const retried = await server.inject(FILE);

    assert.equal(failed.statusCode, 504);
    assert.equal(failed.headers['cache-control'], undefined);
    assert.equal(retried.statusCode, 200);
    assert.equal(calls.length, 2);
  });

  it('keeps no link\'s files that came with failures: a slow page gives its files on the next try', async (t) => {
    const { engine, calls } = fakeEngine(() => ({
      files: [],
      failures: [new EngineError('transient', 'hubdrive.bar did not answer within 8000 ms', { url: 'https://hubdrive.bar/file/1' })],
    }));
    const server = await app(engine);
    t.after(() => server.close());

    const first = await server.inject(LINK);
    await server.inject(LINK);

    assert.equal(first.statusCode, 200);
    assert.equal(first.headers['cache-control'], undefined);
    assert.equal(calls.length, 2);
  });
});
