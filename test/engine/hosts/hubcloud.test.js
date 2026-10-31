import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { scrapeFile } from '../../../src/engine/hosts/index.js';

const URL_HC = 'https://hubcloud.ist/drive/lgfzf1cpxyqfo1l';
// Live pages (2026-10-31): a /drive/ and a /video/ file.
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

  it('reads sizes in binary units, KB to TB', async () => {
    const cases = [['12.5 KB', 12800], ['265.62 MB', 278522757], ['2 GB', 2 * 1024 ** 3], ['1.5 TB', 1.5 * 1024 ** 4], ['7.63gb', Math.round(7.63 * 1024 ** 3)]];
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
