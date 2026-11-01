import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { greenMotorsPage, web } from './helpers.js';
import { scrapeLinks } from '../../src/engine/links.js';

// Pages shaped like the live ones (2026-10-31), small enough to read in a test.
const greenMotors = (destination) => greenMotorsPage({ o: Buffer.from(destination).toString('base64') });
const hubLinks = (...links) => `<div class="entry-content">${links.map((link) => `<a href="${link}">Drive</a>`).join('')}</div>`;
const hubDrive = (link) => `<table><tr><td>File Size</td><td>1 GB</td></tr></table><div class="card-body"><h4><a href="${link}">[HubCloud Server]</a></h4></div>`;

describe('scrapeLinks', () => {
  it('follows each link through its gateways to the files, in the links\' order', async () => {
    const options = web({
      'https://greenmotors.cc/?id=a': greenMotors('https://hblinks.lol/archives/1'),
      'https://hblinks.lol/archives/1': hubLinks('https://hubdrive.bar/file/7', 'https://hubcloud.ist/drive/b'),
      'https://hubdrive.bar/file/7': hubDrive('https://hubcloud.ist/drive/a'),
      'https://hubdrive.bar/file/9': hubDrive('https://hubcloud.ist/drive/c'),
    });
    const urls = ['https://greenmotors.cc/?id=a', 'https://hubcdn.club/file/cdn1', 'https://hubdrive.bar/file/9'];

    const { files, failures } = await scrapeLinks(urls, options);

    assert.deepEqual(files.map(({ host, externalId }) => `${host}:${externalId}`), ['hubcloud:a', 'hubcloud:b', 'hubcdn:cdn1', 'hubcloud:c']);
    assert.deepEqual(files[0], { host: 'hubcloud', externalId: 'a', url: 'https://hubcloud.ist/drive/a', label: 'Drive' });
    assert.deepEqual(failures, []);
  });

  it('gives each file once, from the first link that leads to it', async () => {
    // 4KHDHub's HubCloud and HubDrive buttons lead to one file (441 times on 14 live posts).
    const options = web({ 'https://hubdrive.bar/file/7': hubDrive('https://hubcloud.ist/drive/a') });
    const urls = ['https://hubcloud.ist/drive/a', 'https://hubdrive.bar/file/7', 'http://hubcloud.foo/drive/a'];

    const { files } = await scrapeLinks(urls, options);

    assert.deepEqual(files, [{ host: 'hubcloud', externalId: 'a', url: 'https://hubcloud.ist/drive/a', label: null }]);
  });

  it('labels a file with the first label on its way, the page nearest the post', async () => {
    // A HUBLinks episode page (live, 2026-10-31: archives/121857): "480p – Drive | Direct", where
    // Drive is a HubDrive page whose button is the same HubCloud file as Direct.
    const options = web({
      'https://hblinks.lol/archives/1': '<div class="entry-content"><h3>480p – <a href="https://hubdrive.bar/file/7">Drive</a> | <a href="https://hubcloud.ist/drive/a">Direct</a></h3>'
        + '<h5><a href="https://hubdrive.bar/file/8">4K SDR WEB-DL [8GB]</a></h5></div>',
      'https://hubdrive.bar/file/7': hubDrive('https://hubcloud.ist/drive/a'),
      'https://hubdrive.bar/file/8': hubDrive('https://hubcloud.ist/drive/b'),
    });

    const { files } = await scrapeLinks(['https://hblinks.lol/archives/1'], options);

    assert.deepEqual(files.map(({ externalId, label }) => [externalId, label]), [['a', '480p · Drive'], ['b', '4K SDR WEB-DL [8GB]']]);
  });

  it('reads each gateway page once, however often it is linked', async () => {
    const options = web({ 'https://hubdrive.bar/file/7': hubDrive('https://hubcloud.ist/drive/a') });

    await scrapeLinks(['https://hubdrive.bar/file/7', 'https://hubdrive.bar/file/7'], options);

    assert.deepEqual(options.requests, ['https://hubdrive.bar/file/7']);
  });

  it('moves every URL to its site\'s current domain before reading it, files too', async () => {
    const domains = { hblinks: 'https://hblinks.lol', hubcloud: 'https://hubcloud.ist' };
    const options = web({ 'https://hblinks.lol/archives/1': hubLinks('http://hubcloud.foo/drive/a') });

    const { files } = await scrapeLinks(['https://hblinks.pro/archives/1'], { ...options, domains });

    assert.deepEqual(options.requests, ['https://hblinks.lol/archives/1']);
    assert.equal(files[0].url, 'https://hubcloud.ist/drive/a');
  });

  it('lists the pages that did not lead on as failures, and keeps every other file', async () => {
    const options = web({
      'https://greenmotors.cc/?id=dead': 'Invalid Link !!',
      'https://hubdrive.bar/file/7': '<h2>File not found !</h2>',
    });
    const urls = ['https://greenmotors.cc/?id=dead', 'https://hubdrive.bar/file/7', 'https://hubcloud.ist/drive/a'];

    const { files, failures } = await scrapeLinks(urls, options);

    assert.deepEqual(files.map(({ externalId }) => externalId), ['a']);
    assert.deepEqual(failures.map(({ code, url }) => [code, url]), [
      ['notFound', 'https://greenmotors.cc/?id=dead'],
      ['notFound', 'https://hubdrive.bar/file/7'],
    ]);
  });

  it('tries a page again after a transient failure', async () => {
    let tries = 0;
    const fetchFn = async () => (++tries === 1 ? new Response('', { status: 503 }) : new Response(hubDrive('https://hubcloud.ist/drive/a')));

    const { files, failures } = await scrapeLinks(['https://hubdrive.bar/file/7'], { fetch: fetchFn });

    assert.equal(tries, 2);
    assert.equal(files.length, 1);
    assert.deepEqual(failures, []);
  });

  it('ends at a gateway that leads back to a page read already', async () => {
    const options = web({
      'https://hblinks.lol/archives/1': hubLinks('https://hblinks.lol/archives/2'),
      'https://hblinks.lol/archives/2': hubLinks('https://hblinks.lol/archives/1'),
    });

    const { files, failures } = await scrapeLinks(['https://hblinks.lol/archives/1'], options);

    assert.deepEqual([files, failures], [[], []]);
    assert.equal(options.requests.length, 2);
  });

  it('skips a gateway page\'s link that is no web URL, as the site gave it', async () => {
    // A HUBLinks page that offers a torrent (live, 2026-10-31).
    const options = web({ 'https://hblinks.lol/archives/1': hubLinks('magnet:?xt=urn:btih:91e6', 'https://hubcloud.ist/drive/a') });

    const { files, failures } = await scrapeLinks(['https://hblinks.lol/archives/1'], options);

    assert.deepEqual(files.map(({ externalId }) => externalId), ['a']);
    assert.deepEqual(failures, []);
  });

  it('is a TypeError for a URL that is not a web URL, without a request', async () => {
    const options = web({});
    for (const urls of [['hhttps://hubdrive.bar/file/7'], [{ url: 'https://hubdrive.bar/file/7', label: 'Drive' }], [undefined]]) {
      await assert.rejects(scrapeLinks(urls, options), TypeError);
    }
    assert.deepEqual(options.requests, []);
  });

  it('passes the caller\'s cancellation on as it is', async () => {
    const controller = new AbortController();
    const reason = new DOMException('The user left', 'AbortError');
    const fetchFn = async () => {
      controller.abort(reason);
      throw reason;
    };

    await assert.rejects(scrapeLinks(['https://hubdrive.bar/file/7'], { fetch: fetchFn, signal: controller.signal }), (error) => error === reason);
  });
});
