import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EngineError } from '../../src/engine/index.js';
import { appWith as app, fakeEngine } from './helpers.js';

const id = (url) => Buffer.from(url).toString('base64url');
const get = (server, url) => server.inject(`/v1/links/${id(url)}`);

const GREENMOTORS = 'https://greenmotors.club/?id=cUk4cEpVbFU1NW8';
const HUBLINKS = 'https://hblinks.lol/archives/121795';
const HUBDRIVE = 'https://hubdrive.bar/file/5782484379';
const PACK = 'https://hubdrive.bar/packs/uzyeuxoc';
const HUBCLOUD = 'https://hubcloud.ist/drive/xukqlp6jbsf8wja';
const TELEGRAM = 'https://hubcloud.ist/tg/go?id=3Ofp3dyuoqThzuDY3N';

const FILE = {
  filename: 'Mirzapur.The.Movie.2026.480p.mkv',
  sizeBytes: 791997862,
  downloads: [{ server: 'fsl', kind: 'direct', url: 'https://example.r2.dev/a.mkv', label: 'Download [FSL Server]' }],
};

// The sites, as the engine reads them: each gateway page's links, by URL.
const PAGES = {
  [GREENMOTORS]: [{ url: HUBLINKS, label: null }],
  [HUBLINKS]: [
    { url: HUBDRIVE, label: '480p · Drive' },
    { url: 'magnet:?xt=urn:btih:91e6', label: 'Torrent' },
    { url: 'https://hubcdn.wiki/file/cdn1', label: '480p · Instant' },
    { url: HUBDRIVE, label: '480p · Drive' },
    { url: 'https://gofile.io/d/abc', label: 'GoFile' },
  ],
  // The Telegram link first: the server is found wherever the page puts it.
  [HUBDRIVE]: [{ url: TELEGRAM, label: 'Telegram File' }, { url: HUBCLOUD, label: '[HubCloud Server]' }],
  [PACK]: [{ url: 'https://hubdrive.bar/file/1', label: 'Lupin.S04E01.mkv [3.1 GB]' }],
};

const sites = () => fakeEngine((url) => {
  if (PAGES[url]) return { links: PAGES[url] };
  return FILE;
});

describe('GetLink', () => {
  it('opens a page of files where the user chooses, past GreenMotors: each file once, of what the engine knows', async (t) => {
    const { engine, calls } = sites();
    const server = await app(engine);
    t.after(() => server.close());

    const response = await get(server, GREENMOTORS);

    assert.deepEqual(calls, [['expand', GREENMOTORS], ['expand', HUBLINKS]]);
    assert.deepEqual(response.json(), {
      name: `links/${id(GREENMOTORS)}`,
      kind: 'files',
      files: [
        { name: `links/${id(HUBDRIVE)}`, url: HUBDRIVE, label: '480p · Drive', host: 'hubdrive' },
        { name: `links/${id('https://hubcdn.wiki/file/cdn1')}`, url: 'https://hubcdn.wiki/file/cdn1', label: '480p · Instant', host: 'hubcdn' },
        { name: `links/${id('https://gofile.io/d/abc')}`, url: 'https://gofile.io/d/abc', label: 'GoFile', host: 'gofile' },
      ],
    });
  });

  it('opens a HubDrive pack as a page of files', async (t) => {
    const { engine } = sites();
    const server = await app(engine);
    t.after(() => server.close());

    const { kind, files } = (await get(server, PACK)).json();

    assert.equal(kind, 'files');
    assert.deepEqual(files.map(({ label, host }) => [label, host]), [['Lupin.S04E01.mkv [3.1 GB]', 'hubdrive']]);
  });

  it('opens a HubDrive file page\'s HubCloud file, not its Telegram link', async (t) => {
    const { engine, calls } = sites();
    const server = await app(engine);
    t.after(() => server.close());

    const response = await get(server, HUBDRIVE);

    assert.deepEqual(calls, [['expand', HUBDRIVE], ['resolve', HUBCLOUD]]);
    assert.deepEqual(response.json(), { name: `links/${id(HUBDRIVE)}`, kind: 'file', ...FILE });
  });

  it('opens a file the engine resolves at once: HubCloud, HubCDN', async (t) => {
    const { engine, calls } = sites();
    const server = await app(engine);
    t.after(() => server.close());

    for (const url of [HUBCLOUD, 'https://hubcdn.wiki/file/cdn1']) assert.equal((await get(server, url)).json().kind, 'file', url);

    assert.deepEqual(calls, [['resolve', HUBCLOUD], ['resolve', 'https://hubcdn.wiki/file/cdn1']]);
  });

  it('gives a file the engine does not resolve, or a site it does not know, as external', async (t) => {
    const { engine, calls } = sites();
    const server = await app(engine);
    t.after(() => server.close());

    const streamtape = (await get(server, 'https://stape.fun/v/O4zGkRyymqCZ0J7/a.mkv')).json();
    const unknown = (await get(server, 'https://example.com/a')).json();

    assert.deepEqual([streamtape.kind, streamtape.host, streamtape.url], ['external', 'streamtape', 'https://stape.fun/v/O4zGkRyymqCZ0J7/a.mkv']);
    assert.deepEqual([unknown.kind, unknown.host], ['external', null]);
    assert.deepEqual(calls, []);
  });

  it('gives a HubDrive file page without a HubCloud server as 404', async (t) => {
    const { engine } = fakeEngine(() => ({ links: [{ url: TELEGRAM, label: 'Telegram File' }] }));
    const server = await app(engine);
    t.after(() => server.close());

    const response = await get(server, HUBDRIVE);

    assert.equal(response.statusCode, 404);
    assert.equal(response.json().code, 'notFound');
  });

  it('gives a dead link as 404, as the engine says', async (t) => {
    const { engine } = fakeEngine((url) => {
      throw new EngineError('notFound', 'GreenMotors says the link is dead', { url });
    });
    const server = await app(engine);
    t.after(() => server.close());

    const response = await get(server, GREENMOTORS);

    assert.equal(response.statusCode, 404);
    assert.equal(response.json().code, 'notFound');
  });

  it('gives a name the API did not make as 400, and asks the engine nothing', async (t) => {
    const { engine, calls } = sites();
    const server = await app(engine);
    t.after(() => server.close());

    for (const bad of ['not-base64-of-anything', id('not a url'), id('javascript:alert(1)'), id('ftp://files.example/a')]) {
      const response = await server.inject(`/v1/links/${encodeURIComponent(bad)}`);
      assert.equal(response.statusCode, 400, bad);
      assert.equal(response.json().code, 'invalidArgument', bad);
    }
    assert.deepEqual(calls, []);
  });
});
