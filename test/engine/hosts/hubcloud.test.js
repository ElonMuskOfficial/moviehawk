import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { resolve, scrapeFile } from '../../../src/engine/hosts/index.js';

const URL_HC = 'https://hubcloud.ist/drive/lgfzf1cpxyqfo1l';
// Live pages (2026-10-31): a /drive/ and a /video/ file; the first one's download page, and
// another file's download page with more servers.
const fixture = (name) => readFileSync(new URL(`../../fixtures/hubcloud-${name}.html`, import.meta.url), 'utf8');
const answer = (body, status = 200) => ({ fetch: async () => new Response(body, { status }) });
const pageWith = (filename, size) => `<div class="card-header">${filename}</div><ul><li>File Size<i id="size">${size}</i></li></ul>`;

describe('scrapeFile on HubCloud', () => {
  it('reads the file\'s name and size from live pages', async () => {
    assert.deepEqual(await scrapeFile(URL_HC, answer(fixture('file'))), {
      filename: 'The.Terminal.List.Dark.Wolf.S01E01.480p.WEB-DL.Hindi-English.ESub.x264-HDHub4u.Ms.mkv',
      sizeBytes: 278522757, // 265.62 MB, as stored for this file on 2026-10-28
    });
    assert.deepEqual(await scrapeFile('https://hubcloud.ist/video/0f9100t1nvzvvyc', answer(fixture('video'))), {
      filename: 'Blackout.2024.480p.Hindi.WEB-DL.ESub.x264-HDHub4u.Tv.mkv',
      sizeBytes: Math.round(415.41 * 1024 ** 2),
    });
  });

  it('reads sizes in binary units, KB to GB', async () => {
    const cases = [['12.5 KB', 12800], ['265.62 MB', 278522757], ['2 GB', 2 * 1024 ** 3]];
    for (const [size, bytes] of cases) {
      assert.equal((await scrapeFile(URL_HC, answer(pageWith('a.mkv', size)))).sizeBytes, bytes, size);
    }
  });

  it('is unrecognized for a page without the file\'s name or a size it can read', async () => {
    const pages = [
      '<html><title>Just a moment...</title><body>Checking your browser</body></html>',
      pageWith('', '1.2 GB'),
      pageWith('a.mkv', ''),
      pageWith('a.mkv', '1.2 GiB'),
      pageWith('a.mkv', '1.2 gb'),
      '<p>404 ! File Not Found</p>', // HubCloud's deleted page, but with HTTP 200: never seen live
    ];
    for (const page of pages) {
      await assert.rejects(scrapeFile(URL_HC, answer(page)), { code: 'unrecognized', url: URL_HC });
    }
  });

  it('is notFound when HubCloud answers HTTP 404, as it does for a deleted file', async () => {
    await assert.rejects(scrapeFile(URL_HC, answer('404 ! File Not Found', 404)), { code: 'notFound', status: 404 });
  });
});

describe('scrapeFile', () => {
  it('is unsupported for a host whose file pages the engine does not read, without a request', async () => {
    let requests = 0;
    const options = { fetch: async () => { requests++; return new Response(''); } };
    for (const url of ['https://hubcdn.club/file/abc', 'https://example.com/file/abc']) {
      await assert.rejects(scrapeFile(url, options), { code: 'unsupported', url });
    }
    assert.equal(requests, 0);
  });
});

// The 10Gbps button redirects to an ad page whose `link` is the file's URL (live, 2026-10-31).
const FILE_URL = 'https://video-downloads.googleusercontent.com/ADGPM2kG1c2DPsrJ6hovnnpZWm';
const AD_PAGE = `https://cryptonewz.online/dl.php?link=${FILE_URL}`;

function redirectedTo(url, status = 200) {
  const response = new Response(null, { status });
  Object.defineProperty(response, 'url', { value: url });
  return response;
}

// A fake fetch for resolve: each site answers with its live page; `tenGbps` answers the 10Gbps
// button's redirects.
function sites({ downloadPage = fixture('download'), tenGbps = async () => redirectedTo(AD_PAGE) } = {}) {
  const requests = [];
  const fetchFn = async (url, init) => {
    const { hostname } = new URL(url);
    requests.push([hostname, init.method]);
    if (hostname === 'hubcloud.ist') return new Response(fixture('file'));
    if (hostname === 'gamerxyt.com') return new Response(downloadPage);
    if (hostname === 'gpdl.hubcloud.ist') return tenGbps();
    throw new Error(`No fake answer for ${url}`);
  };
  return { fetch: fetchFn, requests };
}

const serversOf = (downloads) => downloads.map(({ server, kind, label }) => [server, kind, label]);

describe('resolve on HubCloud', () => {
  it('reads the file page, its download page and the 10Gbps redirects', async () => {
    const options = sites();
    const resolved = await resolve(URL_HC, options);

    assert.equal(resolved.filename, 'The.Terminal.List.Dark.Wolf.S01E01.480p.WEB-DL.Hindi-English.ESub.x264-HDHub4u.Ms.mkv');
    assert.equal(resolved.sizeBytes, 278522757);
    assert.deepEqual(serversOf(resolved.downloads), [
      ['10gbps', 'direct', 'Download [Server : 10Gbps]'],
      ['worker', 'direct', 'Download File [265.62 MB]'],
      ['telegram', 'page', 'Download From Telegram'],
    ]);
    assert.equal(resolved.downloads[0].url, FILE_URL);
    assert.match(resolved.downloads[1].url, /^https:\/\/bsnl\.server96\.workers\.dev\/.+\.mkv$/);
    assert.match(resolved.downloads[2].url, /^https:\/\/hubcloud\.ist\/tg\/go\?id=/);
    assert.deepEqual(options.requests, [['hubcloud.ist', 'GET'], ['gamerxyt.com', 'GET'], ['gpdl.hubcloud.ist', 'HEAD']]);
  });

  it('gives every server button in page order, and only the buttons', async () => {
    const resolved = await resolve(URL_HC, sites({ downloadPage: fixture('download-servers') }));

    assert.deepEqual(serversOf(resolved.downloads), [
      ['pixeldrain', 'page', 'Download [PixelServer : 2]'],
      ['fsl', 'direct', 'Download [FSL Server]'],
      ['10gbps', 'direct', 'Download [Server : 10Gbps]'],
      ['watch', 'page', 'Watch Online'],
      ['telegram', 'page', 'Download From Telegram'],
    ]);
    assert.equal(resolved.downloads[0].url, 'https://pixeldrain.dev/u/negn6f');
  });

  it('knows the servers seen live by their text, and keeps any other as `other`', async () => {
    const button = (label, url) => `<h2><a class="btn" href="${url}">${label}</a></h2>`;
    const downloadPage = `<div class="card-body">${[
      button('Download [FSLv2 Server]', 'https://r2.example/a.mkv'),
      button('Download Part 1 [ZipDisk Server]', 'https://ddl2.example/1.zip'),
      button('Download Part 2 [ZipDisk Server]', 'https://ddl2.example/2.zip'),
      button('Download [Buzz Server]', 'https://buzz.example/f/a'),
      button('Download [NewCloud Server]', 'https://new.example/a'),
    ].join('')}</div>`;

    const resolved = await resolve(URL_HC, sites({ downloadPage }));

    assert.deepEqual(serversOf(resolved.downloads), [
      ['fslv2', 'direct', 'Download [FSLv2 Server]'],
      ['zipdisk', 'direct', 'Download Part 1 [ZipDisk Server]'],
      ['zipdisk', 'direct', 'Download Part 2 [ZipDisk Server]'],
      ['buzz', 'page', 'Download [Buzz Server]'],
      ['other', 'page', 'Download [NewCloud Server]'],
    ]);
  });

  it('gives the 10Gbps button as a page when its redirects do not reach the file', async () => {
    const endings = [
      async () => redirectedTo('https://video-downloads.googleusercontent.com/gone', 404), // a zip's, live
      async () => { throw new TypeError('fetch failed'); },
      async () => redirectedTo('https://cryptonewz.online/dl.php'),
    ];
    for (const tenGbps of endings) {
      const [download] = (await resolve(URL_HC, sites({ tenGbps }))).downloads;
      assert.equal(download.kind, 'page');
      assert.match(download.url, /^https:\/\/gpdl\.hubcloud\.ist\/\?id=/);
    }
  });

  it('passes the caller\'s cancellation on, not as a page', async () => {
    const controller = new AbortController();
    const reason = new DOMException('The user left', 'AbortError');
    const options = sites({ tenGbps: async () => { controller.abort(reason); throw reason; } });

    await assert.rejects(resolve(URL_HC, { ...options, signal: controller.signal }), (error) => error === reason);
  });

  it('is unrecognized for a file page without its download link, or a download page without servers', async () => {
    await assert.rejects(resolve(URL_HC, answer(pageWith('a.mkv', '1.2 GB'))), {
      code: 'unrecognized', url: URL_HC, message: 'No link to the download page on the HubCloud page',
    });
    const challenge = '<title>Just a moment...</title><div class="card-body"><h2><a href="https://one.one.one.one">VPN</a></h2></div>';
    await assert.rejects(resolve(URL_HC, sites({ downloadPage: challenge })), (error) => {
      assert.equal(error.code, 'unrecognized');
      assert.match(error.url, /^https:\/\/gamerxyt\.com\/hubcloud\.php\?/);
      return true;
    });
  });

  it('is notFound when HubCloud answers HTTP 404, with no other request', async () => {
    let requests = 0;
    const options = { fetch: async () => { requests++; return new Response('404 ! File Not Found', { status: 404 }); } };

    await assert.rejects(resolve(URL_HC, options), { code: 'notFound', status: 404 });
    assert.equal(requests, 1);
  });
});

describe('resolve', () => {
  it('is unsupported for a host the engine does not resolve, without a request', async () => {
    let requests = 0;
    const options = { fetch: async () => { requests++; return new Response(''); } };
    for (const url of ['https://gofile.io/d/abc', 'https://example.com/file/abc']) {
      await assert.rejects(resolve(url, options), { code: 'unsupported', url });
    }
    assert.equal(requests, 0);
  });
});
