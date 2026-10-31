import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { expandHubLinks } from '../../../src/engine/gateways/hublinks.js';

const URL_HL = 'https://hblinks.lol/archives/1';
// Live pages of each layout (saved 2026-10-28 and 2026-10-29).
const fixture = (name) => readFileSync(new URL(`../../fixtures/hublinks-${name}.html`, import.meta.url), 'utf8');
const answer = (body, { status = 200, url = URL_HL } = {}) => ({
  fetch: async () => {
    const response = new Response(body, { status });
    Object.defineProperty(response, 'url', { value: url });
    return response;
  },
});
const linksOf = async (name) => (await expandHubLinks(URL_HL, answer(fixture(name)))).links;

describe('expandHubLinks', () => {
  it('returns every link in the content, in page order', async () => {
    // An episode page: one line per quality, "Drive | Instant | Direct".
    const links = await linksOf('episode-lines');
    assert.equal(links.length, 15);
    assert.deepEqual(links.slice(0, 3), [
      'https://hubdrive.bar/file/1765030262',
      'https://hubcdn.wiki/file/mOmAgdn51xTUPurcnZ1gg9LZB',
      'https://hubcloud.ist/drive/lgfzf1cpxyqfo1l',
    ]);
    assert.equal((await linksOf('episode-drives')).length, 7);
  });

  it('reads links shown as logos without text', async () => {
    assert.deepEqual(await linksOf('logos'), [
      'https://hubcloud.ist/drive/aiiikkiqbe8qae4',
      'https://hubdrive.bar/file/2330045630',
      'https://gofile.io/d/v7ipQif',
    ]);
  });

  it('returns links to hosts the engine does not know, and torrents, as they are', async () => {
    const legacy = await linksOf('legacy-hosts');
    assert.equal(legacy.length, 23);
    assert.equal(legacy[0], 'https://uploadbaz.me/n4riqrhm43qd');
    const [torrent] = await linksOf('torrent-only');
    assert.match(torrent, /^magnet:\?xt=urn:btih:91e696cc/);
  });

  it('leads nowhere from a removed page, without failing', async () => {
    assert.deepEqual(await linksOf('removed'), []);
  });

  it('resolves relative links against the page\'s address after redirects', async () => {
    const page = '<div class="entry-content"><a href="/archives/2">Instant</a></div>';
    const { links } = await expandHubLinks('https://hblinks.pro/archives/1', answer(page, { url: 'https://hblinks.lol/archives/1' }));
    assert.deepEqual(links, ['https://hblinks.lol/archives/2']);
  });

  it('is unrecognized for a page without the content area', async () => {
    const page = '<html><body><a href="https://hubcloud.ist/drive/abc">Download</a></body></html>';
    await assert.rejects(expandHubLinks(URL_HL, answer(page)), { code: 'unrecognized', url: URL_HL });
  });

  it('passes fetching errors on as they are', async () => {
    await assert.rejects(expandHubLinks(URL_HL, answer('', { status: 404 })), { code: 'notFound', status: 404 });
  });
});
