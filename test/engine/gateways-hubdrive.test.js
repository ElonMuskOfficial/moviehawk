import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { expandHubDrive } from '../../src/engine/gateways/hubdrive.js';

const FILE_URL = 'https://hubdrive.bar/file/1976154028';
const PACK_URL = 'https://hubdrive.bar/packs/nqhtppaz';
// Live pages (2026-10-31; "the file has been deleted": 2026-10-29).
const fixture = (name) => readFileSync(new URL(`../fixtures/hubdrive-${name}.html`, import.meta.url), 'utf8');
const answer = (body, url, status = 200) => ({
  fetch: async () => {
    const response = new Response(body, { status });
    Object.defineProperty(response, 'url', { value: url });
    return response;
  },
});

describe('expandHubDrive', () => {
  it('returns a file page\'s server buttons, without its ad and "Copy Link"', async () => {
    const { links } = await expandHubDrive(FILE_URL, answer(fixture('file'), FILE_URL));
    assert.equal(links.length, 2);
    assert.equal(links[0], 'https://hubcloud.ist/drive/e0ueeuiluu8pire');
    assert.match(links[1], /^https:\/\/hubcloud\.ist\/tg\/go\?id=/);
  });

  it('leads nowhere from a real file page without servers, without failing', async () => {
    const page = '<table><tr><td>File Size</td><td>1.2 GB</td></tr></table><div class="card-body"><h5>Movie.mkv</h5></div>';
    assert.deepEqual(await expandHubDrive(FILE_URL, answer(page, FILE_URL)), { links: [] });
  });

  it('returns a pack\'s rows as file pages, in page order', async () => {
    const { links } = await expandHubDrive(PACK_URL, answer(fixture('pack'), PACK_URL));
    assert.equal(links.length, 9);
    assert.deepEqual(links.slice(0, 2), ['https://hubdrive.bar/file/51828476429', 'https://hubdrive.bar/file/6957876604']);
  });

  it('is notFound on HubDrive\'s deleted pages', async () => {
    for (const name of ['file-not-found', 'deleted-the-file']) {
      await assert.rejects(expandHubDrive(FILE_URL, answer(fixture(name), FILE_URL)), { code: 'notFound', url: FILE_URL });
    }
    await assert.rejects(expandHubDrive(PACK_URL, answer('<h3>File not found !</h3>', PACK_URL)), { code: 'notFound' });
  });

  it('is unrecognized for a file page without the file\'s details, or a pack without rows', async () => {
    const challenge = '<html><title>Just a moment...</title><body><h1>Checking your browser</h1></body></html>';
    await assert.rejects(expandHubDrive(FILE_URL, answer(challenge, FILE_URL)), { code: 'unrecognized', url: FILE_URL });
    await assert.rejects(expandHubDrive(PACK_URL, answer(challenge, PACK_URL)), { code: 'unrecognized', url: PACK_URL });
  });

  it('passes fetching errors on as they are', async () => {
    await assert.rejects(expandHubDrive(PACK_URL, answer('', PACK_URL, 404)), { code: 'notFound', status: 404 });
  });
});
