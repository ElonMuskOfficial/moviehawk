import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { scrapeListing } from '../../src/engine/listings.js';

// A listing page shaped like HDHub4u's (2026-10-31), small enough to read in a test.
const hdHub4uListing = (...posts) => `<ul class="recent-movies">${posts.map((post) => `<li><a href="${post}">Post</a></li>`).join('')}</ul>`;

// A fake web: each URL answers with its page, or with an HTTP status; it records every request.
function web(pages) {
  const requests = [];
  const fetchFn = async (url) => {
    requests.push(url);
    const page = pages[url];
    if (page === undefined) throw new Error(`No fake page for ${url}`);
    return typeof page === 'number' ? new Response('', { status: page }) : new Response(page);
  };
  return { fetch: fetchFn, requests };
}

describe('scrapeListing', () => {
  it('reads page 1 at the site\'s root and page n at /page/n/', async () => {
    const options = web({
      'https://new10.hdhub4u.cl/': hdHub4uListing('https://new10.hdhub4u.cl/a/'),
      'https://new10.hdhub4u.cl/page/2/': hdHub4uListing('https://new10.hdhub4u.cl/b/', 'https://new10.hdhub4u.cl/c/'),
    });

    assert.deepEqual(await scrapeListing('https://new10.hdhub4u.cl', 1, options), { postUrls: ['https://new10.hdhub4u.cl/a/'] });
    assert.deepEqual(await scrapeListing('https://new10.hdhub4u.cl/some-post/', 2, options), {
      postUrls: ['https://new10.hdhub4u.cl/b/', 'https://new10.hdhub4u.cl/c/'],
    });
    assert.deepEqual(options.requests, ['https://new10.hdhub4u.cl/', 'https://new10.hdhub4u.cl/page/2/']);
  });

  it('reads the listing on its site\'s current domain', async () => {
    const options = web({ 'https://new10.hdhub4u.cl/page/3/': hdHub4uListing('https://new10.hdhub4u.cl/a/') });

    await scrapeListing('https://new9.hdhub4u.cl', 3, { ...options, domains: { hdhub4u: 'https://new10.hdhub4u.cl' } });

    assert.deepEqual(options.requests, ['https://new10.hdhub4u.cl/page/3/']);
  });

  it('is notFound after the last page, without trying again', async () => {
    const options = web({ 'https://new10.hdhub4u.cl/page/999/': 404 });

    await assert.rejects(scrapeListing('https://new10.hdhub4u.cl', 999, options), { code: 'notFound' });
    assert.equal(options.requests.length, 1);
  });

  it('is unsupported for a site the engine does not read, and a TypeError for a wrong page, without a request', async () => {
    const options = web({});
    await assert.rejects(scrapeListing('https://example.com', 1, options), { code: 'unsupported' });
    await assert.rejects(scrapeListing('not a url', 1, options), TypeError);
    for (const page of [0, -1, 1.5, '2']) await assert.rejects(scrapeListing('https://new10.hdhub4u.cl', page, options), TypeError);
    assert.deepEqual(options.requests, []);
  });
});
