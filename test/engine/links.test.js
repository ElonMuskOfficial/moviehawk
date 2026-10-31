import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { scrapeLinks } from '../../src/engine/links.js';

// Pages shaped like the live ones (2026-10-31), small enough to read in a test.
const base64 = (text) => Buffer.from(text).toString('base64');
const rot13 = (text) => text.replace(/[a-z]/gi, (c) => String.fromCharCode(((c.charCodeAt(0) - (c <= 'Z' ? 65 : 97) + 13) % 26) + (c <= 'Z' ? 65 : 97)));
const greenMotors = (destination) => `<script>s('o','${base64(base64(rot13(base64(JSON.stringify({ o: base64(destination) })))))}')</script>`;
const hubLinks = (...links) => `<div class="entry-content">${links.map((link) => `<a href="${link}">Drive</a>`).join('')}</div>`;
const hubDrive = (link) => `<table><tr><td>File Size</td><td>1 GB</td></tr></table><div class="card-body"><h4><a href="${link}">[HubCloud Server]</a></h4></div>`;

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
    assert.deepEqual(files[0], { host: 'hubcloud', externalId: 'a', url: 'https://hubcloud.ist/drive/a' });
    assert.deepEqual(failures, []);
  });

  it('gives each file once, from the first link that leads to it', async () => {
    // 4KHDHub's HubCloud and HubDrive buttons lead to one file (441 times on 14 live posts).
    const options = web({ 'https://hubdrive.bar/file/7': hubDrive('https://hubcloud.ist/drive/a') });
    const urls = ['https://hubcloud.ist/drive/a', 'https://hubdrive.bar/file/7', 'http://hubcloud.foo/drive/a'];

    const { files } = await scrapeLinks(urls, options);

    assert.deepEqual(files, [{ host: 'hubcloud', externalId: 'a', url: 'https://hubcloud.ist/drive/a' }]);
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

  it('stops following a link after 5 gateways in a row', async () => {
    const pages = {};
    for (let n = 1; n <= 6; n++) pages[`https://hblinks.lol/archives/${n}`] = hubLinks(`https://hblinks.lol/archives/${n + 1}`);

    const { failures } = await scrapeLinks(['https://hblinks.lol/archives/1'], web(pages));

    assert.deepEqual(failures.map(({ code, url }) => [code, url]), [['unrecognized', 'https://hblinks.lol/archives/6']]);
  });

  it('reports what happened to each link', async () => {
    const events = [];
    const options = web({
      'https://hubdrive.bar/file/7': hubDrive('https://hubcloud.ist/drive/a'),
      'https://greenmotors.cc/?id=dead': 'Invalid Link !!',
    });
    const urls = ['https://hubdrive.bar/file/7', 'https://wa.me/1', 'https://greenmotors.cc/?id=dead'];

    await scrapeLinks(urls, { ...options, onEvent: (event) => events.push(event) });

    assert.deepEqual(events.map(({ type, url }) => [type, url]).toSorted(), [
      ['failure', 'https://greenmotors.cc/?id=dead'],
      ['file', 'https://hubcloud.ist/drive/a'],
      ['gateway', 'https://hubdrive.bar/file/7'],
      ['skipped', 'https://wa.me/1'],
    ]);
  });

  it('is a TypeError for a URL that is not a string, without a request', async () => {
    const options = web({});
    for (const urls of [[{ url: 'https://hubdrive.bar/file/7', label: 'Drive' }], [null], [7]]) {
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
