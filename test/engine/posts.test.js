import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { scrapePost } from '../../src/engine/posts.js';

const POST_URL = 'https://new10.hdhub4u.cl/show-2026/';

// Pages shaped like the live ones (2026-10-31), small enough to read in a test.
const base64 = (text) => Buffer.from(text).toString('base64');
const rot13 = (text) => text.replace(/[a-z]/gi, (c) => String.fromCharCode(((c.charCodeAt(0) - (c <= 'Z' ? 65 : 97) + 13) % 26) + (c <= 'Z' ? 65 : 97)));
const greenMotors = (destination) => `<script>s('o','${base64(base64(rot13(base64(JSON.stringify({ o: base64(destination) })))))}')</script>`;
const hubLinks = (...links) => `<div class="entry-content">${links.map((link) => `<a href="${link}">Drive</a>`).join('')}</div>`;
const hubDrive = (link) => `<table><tr><td>File Size</td><td>1 GB</td></tr></table><div class="card-body"><h4><a href="${link}">[HubCloud Server]</a></h4></div>`;
const hdHub4uPost = (...links) => `<h1 class="page-title"><span class="material-text">Show (2026)</span></h1>
  <main class="page-body">${links.map((link) => `<a href="${link}">Download</a>`).join('')}</main>`;

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

describe('scrapePost', () => {
  it('follows each link through its gateways to the files, in page order', async () => {
    const options = web({
      [POST_URL]: hdHub4uPost(
        'https://greenmotors.cc/?id=a', 'https://hubcdn.club/file/cdn1', 'https://wa.me/123', 'https://hubdrive.bar/file/9',
      ),
      'https://greenmotors.cc/?id=a': greenMotors('https://hblinks.lol/archives/1'),
      'https://hblinks.lol/archives/1': hubLinks('https://hubdrive.bar/file/7', 'https://hubcloud.ist/drive/b'),
      'https://hubdrive.bar/file/7': hubDrive('https://hubcloud.ist/drive/a'),
      'https://hubdrive.bar/file/9': hubDrive('https://hubcloud.ist/drive/c'),
    });

    const { post, files, linkCount, failures } = await scrapePost(POST_URL, options);

    assert.equal(post.title, 'Show (2026)');
    assert.deepEqual(files.map(({ host, externalId }) => `${host}:${externalId}`), ['hubcloud:a', 'hubcloud:b', 'hubcdn:cdn1', 'hubcloud:c']);
    assert.deepEqual(files[0], { host: 'hubcloud', externalId: 'a', url: 'https://hubcloud.ist/drive/a', statedLanguages: null });
    assert.equal(linkCount, 3); // WhatsApp is no gateway and no host.
    assert.deepEqual(failures, []);
  });

  it('gives each file once, from the first link that leads to it', async () => {
    // 4KHDHub's HubCloud and HubDrive buttons lead to one file (441 times on 14 live posts).
    const options = web({
      [POST_URL]: hdHub4uPost('https://hubcloud.ist/drive/a', 'https://hubdrive.bar/file/7', 'http://hubcloud.foo/drive/a'),
      'https://hubdrive.bar/file/7': hubDrive('https://hubcloud.ist/drive/a'),
    });

    const { files } = await scrapePost(POST_URL, options);

    assert.deepEqual(files, [{ host: 'hubcloud', externalId: 'a', url: 'https://hubcloud.ist/drive/a', statedLanguages: null }]);
  });

  it('reads each gateway page once, however often the post links it', async () => {
    const options = web({
      [POST_URL]: hdHub4uPost('https://hubdrive.bar/file/7', 'https://hubdrive.bar/file/7'),
      'https://hubdrive.bar/file/7': hubDrive('https://hubcloud.ist/drive/a'),
    });

    await scrapePost(POST_URL, options);

    assert.deepEqual(options.requests, [POST_URL, 'https://hubdrive.bar/file/7']);
  });

  it('gives each file the languages the post states for its link', async () => {
    const url = 'https://4khdhub.one/show-series-1/';
    const block = (languages, link) => `<div class="download-item">
      <span class="badge" style="background-color: #0d9488; color: white;">${languages}</span><a href="${link}">Download HubDrive</a></div>`;
    const options = web({
      [url]: `<h1 class="page-title">Show</h1>${block('Hindi, English', 'https://hubdrive.bar/file/1')}${block('Korean', 'https://hubcloud.ist/drive/k')}`,
      'https://hubdrive.bar/file/1': hubDrive('https://hubcloud.ist/drive/h'),
    });

    const { files } = await scrapePost(url, options);

    assert.deepEqual(files.map(({ externalId, statedLanguages }) => [externalId, statedLanguages]), [['h', 'Hindi, English'], ['k', 'Korean']]);
  });

  it('moves every URL to its site\'s current domain before reading it, files too', async () => {
    const domains = { hdhub4u: 'https://new10.hdhub4u.cl', hblinks: 'https://hblinks.lol', hubcloud: 'https://hubcloud.ist' };
    const options = web({
      [POST_URL]: hdHub4uPost('https://hblinks.pro/archives/1'),
      'https://hblinks.lol/archives/1': hubLinks('http://hubcloud.foo/drive/a'),
    });

    const { files } = await scrapePost('https://new9.hdhub4u.cl/show-2026/', { ...options, domains });

    assert.deepEqual(options.requests, [POST_URL, 'https://hblinks.lol/archives/1']);
    assert.equal(files[0].url, 'https://hubcloud.ist/drive/a');
  });

  it('lists the pages that did not lead on as failures, and keeps every other file', async () => {
    const options = web({
      [POST_URL]: hdHub4uPost('https://greenmotors.cc/?id=dead', 'https://hubdrive.bar/file/7', 'https://hubcloud.ist/drive/a'),
      'https://greenmotors.cc/?id=dead': 'Invalid Link !!',
      'https://hubdrive.bar/file/7': '<h2>File not found !</h2>',
    });

    const { files, failures } = await scrapePost(POST_URL, options);

    assert.deepEqual(files.map(({ externalId }) => externalId), ['a']);
    assert.deepEqual(failures.map(({ code, url }) => [code, url]), [
      ['notFound', 'https://greenmotors.cc/?id=dead'],
      ['notFound', 'https://hubdrive.bar/file/7'],
    ]);
  });

  it('tries a page again after a transient failure', async () => {
    let tries = 0;
    const options = web({ [POST_URL]: hdHub4uPost('https://hubdrive.bar/file/7') });
    const fetchPost = options.fetch;
    options.fetch = async (url) => {
      if (url !== 'https://hubdrive.bar/file/7') return fetchPost(url);
      return ++tries === 1 ? new Response('', { status: 503 }) : new Response(hubDrive('https://hubcloud.ist/drive/a'));
    };

    const { files, failures } = await scrapePost(POST_URL, options);

    assert.equal(tries, 2);
    assert.equal(files.length, 1);
    assert.deepEqual(failures, []);
  });

  it('stops following a link after 5 gateways in a row', async () => {
    const pages = { [POST_URL]: hdHub4uPost('https://hblinks.lol/archives/1') };
    for (let n = 1; n <= 6; n++) pages[`https://hblinks.lol/archives/${n}`] = hubLinks(`https://hblinks.lol/archives/${n + 1}`);

    const { failures } = await scrapePost(POST_URL, web(pages));

    assert.deepEqual(failures.map(({ code, url }) => [code, url]), [['unrecognized', 'https://hblinks.lol/archives/6']]);
  });

  it('reports what happened to each link', async () => {
    const events = [];
    const options = web({
      [POST_URL]: hdHub4uPost('https://hubdrive.bar/file/7', 'https://wa.me/1', 'https://greenmotors.cc/?id=dead'),
      'https://hubdrive.bar/file/7': hubDrive('https://hubcloud.ist/drive/a'),
      'https://greenmotors.cc/?id=dead': 'Invalid Link !!',
    });

    await scrapePost(POST_URL, { ...options, onEvent: (event) => events.push(event) });

    assert.deepEqual(events.map(({ type, url }) => [type, url]).toSorted(), [
      ['failure', 'https://greenmotors.cc/?id=dead'],
      ['file', 'https://hubcloud.ist/drive/a'],
      ['gateway', 'https://hubdrive.bar/file/7'],
      ['skipped', 'https://wa.me/1'],
    ]);
  });

  it('throws the post page\'s own failure, as the site said it', async () => {
    await assert.rejects(scrapePost(POST_URL, web({ [POST_URL]: 404 })), { code: 'notFound', url: POST_URL });
  });

  it('passes the caller\'s cancellation on as it is', async () => {
    const controller = new AbortController();
    const reason = new DOMException('The user left', 'AbortError');
    const options = web({ [POST_URL]: hdHub4uPost('https://hubdrive.bar/file/7') });
    const fetchPost = options.fetch;
    options.fetch = async (url) => {
      if (url === POST_URL) return fetchPost(url);
      controller.abort(reason);
      throw reason;
    };

    await assert.rejects(scrapePost(POST_URL, { ...options, signal: controller.signal }), (error) => error === reason);
  });

  it('is unsupported for a site the engine does not read, without a request', async () => {
    const options = web({});
    await assert.rejects(scrapePost('https://example.com/show/', options), { code: 'unsupported' });
    await assert.rejects(scrapePost('hhttps://new10.hdhub4u.cl/show/', options), TypeError);
    assert.deepEqual(options.requests, []);
  });
});
