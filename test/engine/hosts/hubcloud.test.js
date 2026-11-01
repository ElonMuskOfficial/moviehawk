import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { resolveHubCloud } from '../../../src/engine/hosts/hubcloud.js';

const URL_HC = 'https://hubcloud.ist/drive/lgfzf1cpxyqfo1l';
// Live pages (2026-10-31): a /drive/ and a /video/ file; the first one's download page, and
// another file's download page with more servers.
const fixture = (name) => readFileSync(new URL(`../../fixtures/hubcloud-${name}.html`, import.meta.url), 'utf8');
const answer = (body, status = 200) => ({ fetch: async () => new Response(body, { status }) });
// A file page shaped like the live ones, with its download link.
const pageWith = (filename, size) => `<div class="card-header">${filename}</div><ul><li>File Size<i id="size">${size}</i></li></ul>`
  + '<a id="download" class="btn btn-primary" href="https://gamerxyt.com/hubcloud.php?id=a">Download Here</a>';

// The 10Gbps button redirects to an ad page whose `link` is the file's URL (live, 2026-10-31).
const FILE_URL = 'https://video-downloads.googleusercontent.com/ADGPM2kG1c2DPsrJ6hovnnpZWm';
const AD_PAGE = `https://cryptonewz.online/dl.php?link=${FILE_URL}`;

function redirectedTo(url, status = 200) {
  const response = new Response(null, { status });
  Object.defineProperty(response, 'url', { value: url });
  return response;
}

// A fake fetch: each site answers with its live page (`filePage`, `downloadPage`); `tenGbps` answers the 10Gbps
// button's redirects.
function sites({ filePage = fixture('file'), downloadPage = fixture('download'), tenGbps = async () => redirectedTo(AD_PAGE) } = {}) {
  const requests = [];
  const fetchFn = async (url, init) => {
    const { hostname } = new URL(url);
    requests.push([hostname, init.method]);
    if (hostname === 'hubcloud.ist') return new Response(filePage);
    if (hostname === 'gamerxyt.com') return new Response(downloadPage);
    if (hostname === 'gpdl.hubcloud.ist') return tenGbps();
    throw new Error(`No fake answer for ${url}`);
  };
  return { fetch: fetchFn, requests };
}

const serversOf = (downloads) => downloads.map(({ server, kind, label }) => [server, kind, label]);

describe('resolveHubCloud', () => {
  it('reads the file page, its download page and the 10Gbps redirects', async () => {
    const options = sites();
    const resolved = await resolveHubCloud(URL_HC, options);

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

  it('reads a /video/ file page too, whose download link has no id', async () => {
    const resolved = await resolveHubCloud('https://hubcloud.ist/video/0f9100t1nvzvvyc', sites({ filePage: fixture('video') }));

    assert.equal(resolved.filename, 'Blackout.2024.480p.Hindi.WEB-DL.ESub.x264-HDHub4u.Tv.mkv');
    assert.equal(resolved.sizeBytes, Math.round(415.41 * 1024 ** 2));
  });

  it('reads sizes in binary units, KB to GB', async () => {
    const cases = [['12.5 KB', 12800], ['265.62 MB', 278522757], ['2 GB', 2 * 1024 ** 3]];
    for (const [size, bytes] of cases) {
      assert.equal((await resolveHubCloud(URL_HC, sites({ filePage: pageWith('a.mkv', size) }))).sizeBytes, bytes, size);
    }
  });

  it('is unrecognized for a file page without the file\'s name or a size it can read', async () => {
    const pages = [
      '<html><title>Just a moment...</title><body>Checking your browser</body></html>',
      pageWith('', '1.2 GB'),
      pageWith('a.mkv', ''),
      pageWith('a.mkv', '1.2 GiB'),
      pageWith('a.mkv', '1.2 gb'),
      '<p>404 ! File Not Found</p>', // HubCloud's deleted page, but with HTTP 200: never seen live
    ];
    for (const page of pages) {
      await assert.rejects(resolveHubCloud(URL_HC, answer(page)), { code: 'unrecognized', url: URL_HC });
    }
  });

  it('gives every server button in page order, and only the buttons', async () => {
    const resolved = await resolveHubCloud(URL_HC, sites({ downloadPage: fixture('download-servers') }));

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
      button('Download [PixelServer:2]', 'https://pixeldrain.example/u/a'), // a /video/ file's
      button('Download [NewCloud Server]', 'https://new.example/a'),
    ].join('')}</div>`;

    const resolved = await resolveHubCloud(URL_HC, sites({ downloadPage }));

    assert.deepEqual(serversOf(resolved.downloads), [
      ['fslv2', 'direct', 'Download [FSLv2 Server]'],
      ['zipdisk', 'direct', 'Download Part 1 [ZipDisk Server]'],
      ['zipdisk', 'direct', 'Download Part 2 [ZipDisk Server]'],
      ['buzz', 'page', 'Download [Buzz Server]'],
      ['pixeldrain', 'page', 'Download [PixelServer:2]'],
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
      const [download] = (await resolveHubCloud(URL_HC, sites({ tenGbps }))).downloads;
      assert.equal(download.kind, 'page');
      assert.match(download.url, /^https:\/\/gpdl\.hubcloud\.ist\/\?id=/);
    }
  });

  it('passes the caller\'s cancellation on, not as a page', async () => {
    const controller = new AbortController();
    const reason = new DOMException('The user left', 'AbortError');
    const options = sites({ tenGbps: async () => { controller.abort(reason); throw reason; } });

    await assert.rejects(resolveHubCloud(URL_HC, { ...options, signal: controller.signal }), (error) => error === reason);
  });

  it('is unrecognized for a file page without its download link, or a download page without servers', async () => {
    const withoutLink = '<div class="card-header">a.mkv</div><ul><li>File Size<i id="size">1.2 GB</i></li></ul>';
    await assert.rejects(resolveHubCloud(URL_HC, answer(withoutLink)), {
      code: 'unrecognized', url: URL_HC, message: 'No link to the download page on the HubCloud file page',
    });
    const challenge = '<title>Just a moment...</title><div class="card-body"><h2><a href="https://one.one.one.one">VPN</a></h2></div>';
    await assert.rejects(resolveHubCloud(URL_HC, sites({ downloadPage: challenge })), (error) => {
      assert.equal(error.code, 'unrecognized');
      assert.match(error.url, /^https:\/\/gamerxyt\.com\/hubcloud\.php\?/);
      return true;
    });
  });

  it('is notFound when HubCloud answers HTTP 404, with no other request', async () => {
    let requests = 0;
    const options = { fetch: async () => { requests++; return new Response('404 ! File Not Found', { status: 404 }); } };

    await assert.rejects(resolveHubCloud(URL_HC, options), { code: 'notFound' });
    assert.equal(requests, 1);
  });
});
