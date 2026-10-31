import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolve, scrapeFile } from '../../src/engine/files.js';

// A HubCloud file page shaped like the live ones (2026-10-31), and its download page.
const filePage = '<div class="card-header">a.mkv</div><ul><li>File Size<i id="size">1.5 GB</i></li></ul>'
  + '<a id="download" href="https://gamerxyt.com/hubcloud.php?id=a">Download</a>';
const downloadPage = '<div class="card-body"><h2><a class="btn" href="https://fsl.example/a.mkv">Download [FSL Server]</a></h2></div>';

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

describe('scrapeFile and resolve', () => {
  it('read a stored file on its host\'s current domain', async () => {
    const options = web({ 'https://hubcloud.ist/drive/a': filePage, 'https://gamerxyt.com/hubcloud.php?id=a': downloadPage });
    const domains = { hubcloud: 'https://hubcloud.ist' };

    assert.deepEqual(await scrapeFile('https://hubcloud.foo/drive/a', { ...options, domains }), { filename: 'a.mkv', sizeBytes: 1610612736 });
    const { downloads } = await resolve('http://hubcloud.foo/drive/a', { ...options, domains });

    assert.deepEqual(downloads.map(({ server, kind }) => [server, kind]), [['fsl', 'direct']]);
    assert.deepEqual(options.requests, ['https://hubcloud.ist/drive/a', 'https://hubcloud.ist/drive/a', 'https://gamerxyt.com/hubcloud.php?id=a']);
  });

  it('try again after a transient failure, and not after notFound', async () => {
    let tries = 0;
    const flaky = async () => (++tries === 1 ? new Response('', { status: 503 }) : new Response(filePage));
    assert.equal((await scrapeFile('https://hubcloud.ist/drive/a', { fetch: flaky })).filename, 'a.mkv');
    assert.equal(tries, 2);

    const options = web({ 'https://hubcloud.ist/drive/gone': 404 });
    await assert.rejects(resolve('https://hubcloud.ist/drive/gone', options), { code: 'notFound' });
    assert.equal(options.requests.length, 1);
  });

  it('are unsupported for a host the engine does not read, and a TypeError for no web URL, without a request', async () => {
    const options = web({});
    for (const url of ['https://hubcdn.club/file/abc', 'https://example.com/file/abc']) {
      await assert.rejects(scrapeFile(url, options), { code: 'unsupported', url });
    }
    for (const url of ['https://gofile.io/d/abc', 'https://example.com/file/abc']) {
      await assert.rejects(resolve(url, options), { code: 'unsupported', url });
    }
    await assert.rejects(scrapeFile('hhttps://hubcloud.ist/drive/a', options), TypeError);
    await assert.rejects(resolve('not a url', options), TypeError);
    assert.deepEqual(options.requests, []);
  });
});
