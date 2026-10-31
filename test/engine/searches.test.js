import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { searchPosts } from '../../src/engine/searches.js';

// A search page shaped like 4KHDHub's (2026-10-31), small enough to read in a test.
const searchPage = '<div class="card-grid"><a href="/dexter-series-1/"><img src="https://image.tmdb.org/a.jpg"><h3 class="movie-card-title">Dexter</h3></a></div>';

// A fake web: each URL answers with its page; it records every request.
function web(pages) {
  const requests = [];
  const fetchFn = async (url) => {
    requests.push(url);
    if (pages[url] === undefined) throw new Error(`No fake page for ${url}`);
    return new Response(pages[url]);
  };
  return { fetch: fetchFn, requests };
}

describe('searchPosts', () => {
  it('searches the site on its current domain, with the query as typed but trimmed', async () => {
    const options = web({ 'https://4khdhub.one/?s=dexter': searchPage });

    const { posts } = await searchPosts('https://4khdhub.fans/some-post/', '  dexter ', 1, { ...options, domains: { '4khdhub': 'https://4khdhub.one' } });

    assert.deepEqual(posts, [{ url: 'https://4khdhub.one/dexter-series-1/', title: 'Dexter', posterUrl: 'https://image.tmdb.org/a.jpg' }]);
    assert.deepEqual(options.requests, ['https://4khdhub.one/?s=dexter']);
  });

  it('is unsupported for a site the engine does not read, and a TypeError for a wrong URL, query or page, without a request', async () => {
    const options = web({});
    await assert.rejects(searchPosts('https://example.com', 'dexter', 1, options), { code: 'unsupported' });
    await assert.rejects(searchPosts('not a url', 'dexter', 1, options), TypeError);
    for (const query of ['', '   ', undefined, 7]) await assert.rejects(searchPosts('https://4khdhub.one', query, 1, options), TypeError);
    for (const page of [0, 1.5, '2']) await assert.rejects(searchPosts('https://4khdhub.one', 'dexter', page, options), TypeError);
    assert.deepEqual(options.requests, []);
  });
});
