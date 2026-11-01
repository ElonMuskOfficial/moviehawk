import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { web } from './helpers.js';
import { resolve } from '../../src/engine/files.js';

// A HubCloud file page shaped like the live ones (2026-10-31), and its download page.
const filePage = '<div class="card-header">a.mkv</div><ul><li>File Size<i id="size">1.5 GB</i></li></ul>'
  + '<a id="download" class="btn btn-primary" href="https://gamerxyt.com/hubcloud.php?id=a">Download</a>';
const downloadPage = '<div class="card-body"><h2><a class="btn" href="https://fsl.example/a.mkv">Download [FSL Server]</a></h2></div>';

describe('resolve', () => {
  it('reads a file on an old domain on its host\'s current domain', async () => {
    const options = web({ 'https://hubcloud.ist/drive/a': filePage, 'https://gamerxyt.com/hubcloud.php?id=a': downloadPage });
    const domains = { hubcloud: 'https://hubcloud.ist' };

    const { filename, sizeBytes, downloads } = await resolve('http://hubcloud.foo/drive/a', { ...options, domains });

    assert.deepEqual([filename, sizeBytes], ['a.mkv', 1610612736]);
    assert.deepEqual(downloads.map(({ server, kind }) => [server, kind]), [['fsl', 'direct']]);
    assert.deepEqual(options.requests, ['https://hubcloud.ist/drive/a', 'https://gamerxyt.com/hubcloud.php?id=a']);
  });

  it('tries again after a transient failure, and not after notFound', async () => {
    let tries = 0;
    const pages = { 'https://hubcloud.ist/drive/a': filePage, 'https://gamerxyt.com/hubcloud.php?id=a': downloadPage };
    const flaky = async (url) => (++tries === 1 ? new Response('', { status: 503 }) : new Response(pages[url]));
    assert.equal((await resolve('https://hubcloud.ist/drive/a', { fetch: flaky })).filename, 'a.mkv');
    assert.equal(tries, 3);

    const options = web({ 'https://hubcloud.ist/drive/gone': 404 });
    await assert.rejects(resolve('https://hubcloud.ist/drive/gone', options), { code: 'notFound' });
    assert.equal(options.requests.length, 1);
  });

  it('is unsupported for a host the engine does not resolve, and a TypeError for no web URL, without a request', async () => {
    const options = web({});
    for (const url of ['https://hubcdn.club/file/abc', 'https://gofile.io/d/abc', 'https://example.com/file/abc']) {
      await assert.rejects(resolve(url, options), { code: 'unsupported', url });
    }
    for (const url of ['hhttps://hubcloud.ist/drive/a', 'not a url']) await assert.rejects(resolve(url, options), TypeError);
    assert.deepEqual(options.requests, []);
  });
});
