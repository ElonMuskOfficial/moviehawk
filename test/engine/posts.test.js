import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { web } from './helpers.js';
import { identify } from '../../src/engine/links.js';
import { scrapePost } from '../../src/engine/posts.js';

const POST_URL = 'https://new10.hdhub4u.cl/show-2026/';

// A post page shaped like HDHub4u's (2026-10-31), small enough to read in a test.
const hdHub4uPost = (...links) => `<h1 class="page-title"><span class="material-text">Show (2026)</span></h1>
  <main class="page-body">${links.map((link, i) => `<a href="${link}">Link ${i}</a>`).join('')}</main>`;

describe('scrapePost', () => {
  it('reads the post page only, and gives its links to a gateway or a known host', async () => {
    const options = web({
      [POST_URL]: hdHub4uPost(
        'https://greenmotors.cc/?id=a', 'https://wa.me/123', 'https://www.imdb.com/title/tt1/', 'https://hubcdn.club/file/cdn1',
        'https://new10.hdhub4u.cl/how-to-download/', 'https://hubdrive.bar/file/9',
      ),
    });

    const { post, links } = await scrapePost(POST_URL, options);

    assert.equal(post.title, 'Show (2026)');
    assert.deepEqual(links, [
      { url: 'https://greenmotors.cc/?id=a', label: 'Link 0' },
      { url: 'https://hubcdn.club/file/cdn1', label: 'Link 3' },
      { url: 'https://hubdrive.bar/file/9', label: 'Link 5' },
    ]);
    assert.deepEqual(options.requests, [POST_URL]);
  });

  it('gives links that identify knows', async () => {
    const options = web({ [POST_URL]: hdHub4uPost('https://hubcloud.ist/drive/a') });

    const { links } = await scrapePost(POST_URL, options);

    assert.deepEqual(links.map(({ url }) => identify(url)?.externalId), ['a']);
  });

  it('reads the post on its site\'s current domain', async () => {
    const options = web({ [POST_URL]: hdHub4uPost() });

    await scrapePost('https://new9.hdhub4u.cl/show-2026/', { ...options, domains: { hdhub4u: 'https://new10.hdhub4u.cl' } });

    assert.deepEqual(options.requests, [POST_URL]);
  });

  it('throws the post page\'s own failure, as the site said it', async () => {
    await assert.rejects(scrapePost(POST_URL, web({ [POST_URL]: 404 })), { code: 'notFound', url: POST_URL });
  });

  it('is unsupported for a site the engine does not read, and a TypeError for no web URL, without a request', async () => {
    const options = web({});
    await assert.rejects(scrapePost('https://example.com/show/', options), { code: 'unsupported' });
    await assert.rejects(scrapePost('hhttps://new10.hdhub4u.cl/show/', options), TypeError);
    assert.deepEqual(options.requests, []);
  });
});
