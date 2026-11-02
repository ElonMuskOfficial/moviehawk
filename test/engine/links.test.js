import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { greenMotorsPage, web } from './helpers.js';
import { expand, identify } from '../../engine/links.js';

// Pages shaped like the live ones (2026-10-31), small enough to read in a test.
const greenMotors = (destination) => greenMotorsPage({ o: Buffer.from(destination).toString('base64') });
const hubDrive = (...links) => `<table><tr><td>File Size</td><td>1 GB</td></tr></table><div class="card-body">${links.map((link) => `<h4><a href="${link}">Server</a></h4>`).join('')}</div>`;

describe('identify', () => {
  it('tells a gateway page from a file, and a file the engine resolves from one it does not', () => {
    assert.deepEqual(identify('https://greenmotors.club/?id=a'), { type: 'gateway', id: 'greenmotors' });
    assert.deepEqual(identify('https://hubdrive.live/packs/uzyeuxoc'), { type: 'gateway', id: 'hubdrive' });
    assert.deepEqual(identify('https://hubcloud.foo/drive/a'), { type: 'file', id: 'hubcloud', resolves: true });
    assert.deepEqual(identify('https://hubcdn.wiki/file/cdn1'), { type: 'file', id: 'hubcdn', resolves: true });
    assert.deepEqual(identify('https://stape.fun/v/O4zGkRyymqCZ0J7/a.mkv'), { type: 'file', id: 'streamtape', resolves: false });
  });

  it('tells a post of a site the engine reads, on any of its domains, by its path of one segment', () => {
    // HDHub4u links the same title's post on 4KHDHub (live, 2026-11-02); a category is no post.
    assert.deepEqual(identify('https://4khdhub.fans/dexter-resurrection-series-2297/'), { type: 'post', id: '4khdhub' });
    assert.deepEqual(identify('https://new10.hdhub4u.cl/wrong-turn-2003-hindi-bluray-full-movie/'), { type: 'post', id: 'hdhub4u' });
    assert.equal(identify('https://4khdhub.one/category/movies/'), null);
  });

  it('is null for a page that names no file, a site the engine does not know, or no web URL', () => {
    // HubCloud's Telegram link, on a HubDrive file page (live, 2026-11-01).
    for (const url of ['https://hubcloud.ist/tg/go?id=3Ofp3dyuoq', 'https://hblinks.lol/', 'https://example.com/a', 'magnet:?xt=urn:btih:91e6', 'not a url']) {
      assert.equal(identify(url), null, url);
    }
  });
});

describe('expand', () => {
  it('reads a gateway page on its current domain, and gives its links as the page does', async () => {
    const domains = { greenmotors: 'https://greenmotors.cc' };
    const options = web({ 'https://greenmotors.cc/?id=a': greenMotors('https://hblinks.lol/archives/1') });

    const { links } = await expand('https://greenmotors.club/?id=a', { ...options, domains });

    assert.deepEqual(options.requests, ['https://greenmotors.cc/?id=a']);
    assert.deepEqual(links, [{ url: 'https://hblinks.lol/archives/1', label: null }]);
  });

  it('gives a HubDrive file page\'s every server, in page order', async () => {
    const options = web({ 'https://hubdrive.bar/file/7': hubDrive('https://hubcloud.ist/tg/go?id=t', 'https://hubcloud.ist/drive/a') });

    const { links } = await expand('https://hubdrive.bar/file/7', options);

    assert.deepEqual(links.map(({ url }) => url), ['https://hubcloud.ist/tg/go?id=t', 'https://hubcloud.ist/drive/a']);
  });

  it('tries a page again after a transient failure', async () => {
    let tries = 0;
    const fetchFn = async () => (++tries === 1 ? new Response('', { status: 503 }) : new Response(hubDrive('https://hubcloud.ist/drive/a')));

    const { links } = await expand('https://hubdrive.bar/file/7', { fetch: fetchFn });

    assert.equal(tries, 2);
    assert.equal(links.length, 1);
  });

  it('passes the gateway\'s errors on: a dead link is notFound', async () => {
    const options = web({ 'https://greenmotors.cc/?id=dead': 'Invalid Link !!' });

    await assert.rejects(expand('https://greenmotors.cc/?id=dead', options), { name: 'EngineError', code: 'notFound' });
  });

  it('is unsupported for a URL that is no gateway page, and a TypeError for no web URL, without a request', async () => {
    const options = web({});

    await assert.rejects(expand('https://hubcloud.ist/drive/a', options), { name: 'EngineError', code: 'unsupported' });
    await assert.rejects(expand('hhttps://hubdrive.bar/file/7', options), TypeError);
    assert.deepEqual(options.requests, []);
  });

  it('passes the caller\'s cancellation on as it is', async () => {
    const controller = new AbortController();
    const reason = new DOMException('The user left', 'AbortError');
    const fetchFn = async () => {
      controller.abort(reason);
      throw reason;
    };

    await assert.rejects(expand('https://hubdrive.bar/file/7', { fetch: fetchFn, signal: controller.signal }), (error) => error === reason);
  });
});
