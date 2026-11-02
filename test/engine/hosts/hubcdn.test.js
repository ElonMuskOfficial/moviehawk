import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { answer } from '../helpers.js';
import { filenameOf, resolveHubCdn } from '../../../engine/hosts/hubcdn.js';

const URL_HCDN = 'https://hubcdn.wiki/file/JZ1g9Nmax0tgKnubILv9co6ZC';
// Live pages (2026-11-01): Mirzapur: The Movie's 480p file, and a deleted file's page.
const fixture = (name) => readFileSync(new URL(`../../fixtures/hubcdn-${name}.html`, import.meta.url), 'utf8');
// The file's URL that the live page's link holds.
const FILE_URL = 'https://pub-168ff31bc7034bd388853ee35d479157.r2.dev/d446d11159059d9defadb0c10da47ed9';
const FILENAME = 'Mirzapur.The.Movie.2026.480p.Hindi.DS4K.EXTENDED.WEB-DL.ESub.x264-HDHub4u.Ms.mkv';

// A fake fetch: HubCDN answers with `page`; the file's storage answers the HEAD with `head`
// (its headers, an HTTP status, or a thrown error); every request is recorded.
function sites({ page = fixture('file'), head = { 'content-length': '791997862', 'content-disposition': `attachment; filename*=UTF-8''${FILENAME}` } } = {}) {
  const requests = [];
  const fetchFn = async (url, init) => {
    const { hostname } = new URL(url);
    requests.push([hostname, init.method]);
    if (hostname === 'hubcdn.wiki') return new Response(page);
    if (hostname.endsWith('.r2.dev')) {
      if (head instanceof Error) throw head;
      return typeof head === 'number' ? new Response(null, { status: head }) : new Response(null, { headers: head });
    }
    throw new Error(`No fake answer for ${url}`);
  };
  return { fetch: fetchFn, requests };
}

describe('resolveHubCdn', () => {
  it('reads the file\'s URL from the page\'s link, and its name and size from its headers', async () => {
    const options = sites();

    const file = await resolveHubCdn(URL_HCDN, options);

    assert.deepEqual(file, {
      filename: FILENAME,
      sizeBytes: 791997862,
      downloads: [{ server: 'hubcdn', kind: 'direct', url: FILE_URL, label: 'Download [HubCDN]' }],
    });
  });

  it('asks the file\'s URL for its headers only: a HEAD, never a GET', async () => {
    const options = sites();

    await resolveHubCdn(URL_HCDN, options);

    assert.deepEqual(options.requests, [['hubcdn.wiki', 'GET'], ['pub-168ff31bc7034bd388853ee35d479157.r2.dev', 'HEAD']]);
  });

  it('still gives the download when the file\'s headers cannot be read', async () => {
    for (const head of [403, new TypeError('fetch failed'), {}]) {
      const file = await resolveHubCdn(URL_HCDN, sites({ head }));
      assert.equal(file.filename, null, String(head));
      assert.equal(file.sizeBytes, null, String(head));
      assert.equal(file.downloads[0].url, FILE_URL, String(head));
    }
  });

  it('is notFound on HubCDN\'s deleted page, and on HTTP 404', async () => {
    await assert.rejects(resolveHubCdn(URL_HCDN, sites({ page: fixture('deleted') })), { code: 'notFound', url: URL_HCDN });
    await assert.rejects(resolveHubCdn(URL_HCDN, answer('', { status: 404 })), { code: 'notFound' });
  });

  it('is unrecognized for a page without the link, or a link without the file\'s URL', async () => {
    const challenge = '<html><title>Just a moment...</title><body>Checking your browser</body></html>';
    await assert.rejects(resolveHubCdn(URL_HCDN, sites({ page: challenge })), { code: 'unrecognized', url: URL_HCDN });
    const noFile = Buffer.from('https://hubcdn.club/dl/?nothing=1').toString('base64');
    await assert.rejects(resolveHubCdn(URL_HCDN, sites({ page: `var reurl = "https://inventoryidea.com/?r=${noFile}";` })), { code: 'unrecognized' });
  });
});

describe('filenameOf', () => {
  it('reads R2\'s encoded name and Google\'s quoted one', () => {
    assert.equal(filenameOf("attachment; filename*=UTF-8''WALL%C2%B7E.2008.mkv"), 'WALL·E.2008.mkv');
    assert.equal(filenameOf('attachment; filename="Mirzapur.1080p.mkv"'), 'Mirzapur.1080p.mkv');
    assert.equal(filenameOf('attachment; filename=plain.mkv; size=1'), 'plain.mkv');
  });

  it('prefers the encoded name, and is null without one', () => {
    assert.equal(filenameOf('attachment; filename="a.mkv"; filename*=UTF-8\'\'b.mkv'), 'b.mkv');
    assert.equal(filenameOf('attachment'), null);
    assert.equal(filenameOf(null), null);
  });
});
