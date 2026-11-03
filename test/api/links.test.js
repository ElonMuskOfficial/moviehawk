import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EngineError } from '../../engine/index.js';
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

// A HUBLinks page as the engine reads it (expandHubLinks): its title, and its links in its groups:
// an episode's quality line, a torrent, mirrors on hosts the engine knows and does not.
const HUBLINKS_PAGE = {
  title: 'Lupin.S04E01 – HUBLinks',
  tags: [],
  links: [],
  sections: [
    { title: null, lines: [{ title: '480p', links: [{ url: HUBDRIVE, label: 'Drive' }, { url: 'https://hubcdn.wiki/file/cdn1', label: 'Instant' }], tags: [] }] },
    { title: null, lines: [{ title: 'Magnet | Torrent', links: [{ url: 'magnet:?xt=urn:btih:91e6', label: 'Magnet | Torrent' }], tags: [] }] },
    { title: 'More Download links', lines: [{ title: null, links: [{ url: 'https://gofile.io/d/abc', label: 'gofile.io/d/abc' }, { url: 'https://www.megaup.net/x1', label: 'megaup.net/x1' }], tags: [] }] },
  ],
};

// The sites, as the engine reads them: each gateway page, by URL (a list: its links alone).
const PAGES = {
  [GREENMOTORS]: [{ url: HUBLINKS, label: null }],
  [HUBLINKS]: HUBLINKS_PAGE,
  // The Telegram link first: the server is found wherever the page puts it.
  [HUBDRIVE]: [{ url: TELEGRAM, label: 'Telegram File' }, { url: HUBCLOUD, label: '[HubCloud Server]' }],
  // A HubDrive pack, as the engine reads it (expandHubDrive): one group, a line per file, its size its tag.
  [PACK]: {
    links: [{ url: 'https://hubdrive.bar/file/1', label: 'Lupin.S04E01.mkv' }],
    title: 'Lupin - S04 1080p WEB-DL Packs',
    tags: ['Includes 9 files', 'Total Size: 23.61 GB'],
    sections: [{ title: null, lines: [{ title: 'Lupin.S04E01.mkv', links: [{ url: 'https://hubdrive.bar/file/1', label: 'Lupin.S04E01.mkv' }], tags: ['3.1 GB'] }] }],
  },
};

const sites = () => fakeEngine((url) => {
  if (Array.isArray(PAGES[url])) return { links: PAGES[url] };
  return PAGES[url] ?? FILE;
});
const named = (url, label, host) => ({ name: `links/${id(url)}`, url, label, host });

describe('GetLink', () => {
  it('opens a page of files where the user chooses, past GreenMotors: its title and groups, every web link', async (t) => {
    const { engine, calls } = sites();
    const server = await app(engine);
    t.after(() => server.close());

    const response = await get(server, GREENMOTORS);

    // The torrent is no web URL, so its line and group go; a host the engine does not know stays,
    // named by its hostname.
    assert.deepEqual(calls, [['expand', GREENMOTORS], ['expand', HUBLINKS]]);
    assert.deepEqual(response.json(), {
      name: `links/${id(GREENMOTORS)}`,
      kind: 'files',
      host: 'hblinks',
      url: HUBLINKS,
      title: 'Lupin.S04E01 – HUBLinks',
      tags: [],
      sections: [
        { title: null, lines: [{ title: '480p', tags: [], links: [named(HUBDRIVE, 'Drive', 'hubdrive'), named('https://hubcdn.wiki/file/cdn1', 'Instant', 'hubcdn')] }] },
        {
          title: 'More Download links',
          lines: [{ title: null, tags: [], links: [named('https://gofile.io/d/abc', 'gofile.io/d/abc', 'gofile'), named('https://www.megaup.net/x1', 'megaup.net/x1', 'megaup.net')] }],
        },
      ],
    });
  });

  it('opens a post of a site the API reads as that post, past GreenMotors; another page there is external', async (t) => {
    // HDHub4u's "4K | SDR | HDR | DV" heading links the title's post on 4KHDHub (live, 2026-11-02).
    const POST = 'https://4khdhub.fans/dexter-resurrection-series-2297/';
    const GREEN = 'https://greenmotors.club/?id=4k';
    const { engine, calls } = fakeEngine((url) => (url === GREEN ? { links: [{ url: POST, label: null }] } : FILE));
    const server = await app(engine);
    t.after(() => server.close());

    const direct = (await get(server, POST)).json();
    const past = (await get(server, GREEN)).json();
    const other = (await get(server, 'https://4khdhub.one/category/movies/')).json();

    assert.deepEqual(direct, { name: `links/${id(POST)}`, kind: 'post', post: 'sites/4khdhub/posts/dexter-resurrection-series-2297' });
    assert.deepEqual(past, { name: `links/${id(GREEN)}`, kind: 'post', post: 'sites/4khdhub/posts/dexter-resurrection-series-2297' });
    assert.equal(other.kind, 'external');
    assert.deepEqual(calls, [['expand', GREEN]]);
  });

  it('opens a HubDrive pack as a page of files: its name and tags, one group, a line per file', async (t) => {
    const { engine } = sites();
    const server = await app(engine);
    t.after(() => server.close());

    const { kind, title, tags, sections } = (await get(server, PACK)).json();

    assert.equal(kind, 'files');
    assert.equal(title, 'Lupin - S04 1080p WEB-DL Packs');
    assert.deepEqual(tags, ['Includes 9 files', 'Total Size: 23.61 GB']);
    assert.deepEqual(sections, [{
      title: null,
      lines: [{ title: 'Lupin.S04E01.mkv', tags: ['3.1 GB'], links: [named('https://hubdrive.bar/file/1', 'Lupin.S04E01.mkv', 'hubdrive')] }],
    }]);
  });

  it('opens a HubDrive file page\'s HubCloud file, not its Telegram link', async (t) => {
    const { engine, calls } = sites();
    const server = await app(engine);
    t.after(() => server.close());

    const response = await get(server, HUBDRIVE);

    // Its source is the file's page on HubCloud, where the link opens.
    assert.deepEqual(calls, [['expand', HUBDRIVE], ['resolve', HUBCLOUD]]);
    assert.deepEqual(response.json(), { name: `links/${id(HUBDRIVE)}`, kind: 'file', host: 'hubcloud', url: HUBCLOUD, ...FILE });
  });

  it('opens a file the engine resolves at once: HubCloud, HubCDN', async (t) => {
    const { engine, calls } = sites();
    const server = await app(engine);
    t.after(() => server.close());

    for (const url of [HUBCLOUD, 'https://hubcdn.wiki/file/cdn1']) assert.equal((await get(server, url)).json().kind, 'file', url);

    assert.deepEqual(calls, [['resolve', HUBCLOUD], ['resolve', 'https://hubcdn.wiki/file/cdn1']]);
  });

  it('gives a file the engine does not resolve, or a site it does not know, as external: its host the id, or the hostname', async (t) => {
    const { engine, calls } = sites();
    const server = await app(engine);
    t.after(() => server.close());

    const streamtape = (await get(server, 'https://stape.fun/v/O4zGkRyymqCZ0J7/a.mkv')).json();
    const unknown = (await get(server, 'https://example.com/a')).json();

    assert.deepEqual([streamtape.kind, streamtape.host, streamtape.url], ['external', 'streamtape', 'https://stape.fun/v/O4zGkRyymqCZ0J7/a.mkv']);
    assert.deepEqual([unknown.kind, unknown.host], ['external', 'example.com']);
    assert.deepEqual(calls, []);
  });

  it('follows a HubDrive file page without a HubCloud server to its first link, and gives one without links as 404', async (t) => {
    const { engine } = fakeEngine((url) => ({ links: url === HUBDRIVE ? [{ url: TELEGRAM, label: 'Telegram File' }] : [] }));
    const server = await app(engine);
    t.after(() => server.close());

    const telegram = (await get(server, HUBDRIVE)).json();
    const empty = await get(server, 'https://hubdrive.bar/file/0');

    assert.deepEqual([telegram.kind, telegram.url], ['external', TELEGRAM]);
    assert.equal(empty.statusCode, 404);
    assert.equal(empty.json().code, 'notFound');
  });

  it('gives a GreenMotors link to no web URL (a magnet) as 404: the API names web links only', async (t) => {
    const { engine } = fakeEngine(() => ({ links: [{ url: 'magnet:?xt=urn:btih:abc', label: null }] }));
    const server = await app(engine);
    t.after(() => server.close());

    const response = await get(server, GREENMOTORS);

    assert.equal(response.statusCode, 404);
    assert.equal(response.json().code, 'notFound');
  });

  it('opens three gateway pages in a row at most', async (t) => {
    // GreenMotors that leads to GreenMotors, again and again.
    const { engine, calls } = fakeEngine((url) => ({ links: [{ url: `${url}x`, label: null }] }));
    const server = await app(engine);
    t.after(() => server.close());

    const response = await get(server, GREENMOTORS);

    assert.equal(response.statusCode, 502);
    assert.equal(response.json().code, 'unrecognized');
    assert.equal(calls.length, 3);
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

  it('opens a NexDrive page as a page of files: its title and its lines of servers', async (t) => {
    const NEXDRIVE = 'https://nexdrive.beer/genxfm784776189733/';
    const VCLOUD = 'https://vcloud.beer/kkjqqdb1b0o1rnw';
    const { engine, calls } = fakeEngine(() => ({
      title: 'Killer Ratings (Season-1) Hindi 720p (Episode 1-7) [550MB]',
      tags: [],
      links: [{ url: VCLOUD, label: '⚡ V-Cloud [Resumable]' }],
      sections: [{ title: null, lines: [{ title: '-:Episodes: 1:-', links: [{ url: VCLOUD, label: '⚡ V-Cloud [Resumable]' }], tags: [] }] }],
    }));
    const server = await app(engine);
    t.after(() => server.close());

    const page = (await get(server, NEXDRIVE)).json();

    assert.deepEqual([page.kind, page.host, page.title], ['files', 'nexdrive', 'Killer Ratings (Season-1) Hindi 720p (Episode 1-7) [550MB]']);
    assert.deepEqual(page.sections[0].lines[0].links, [{ name: `links/${id(VCLOUD)}`, url: VCLOUD, label: '⚡ V-Cloud [Resumable]', host: 'vcloud' }]);
    assert.deepEqual(calls, [['expand', NEXDRIVE]]);
  });
});
