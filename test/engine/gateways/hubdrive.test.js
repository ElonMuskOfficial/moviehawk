import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { answer } from '../helpers.js';
import { expandHubDrive } from '../../../src/engine/gateways/hubdrive.js';

const FILE_URL = 'https://hubdrive.bar/file/1976154028';
const PACK_URL = 'https://hubdrive.bar/packs/nqhtppaz';
// Live pages (2026-10-31; "the file has been deleted": 2026-10-29).
const fixture = (name) => readFileSync(new URL(`../../fixtures/hubdrive-${name}.html`, import.meta.url), 'utf8');

describe('expandHubDrive', () => {
  it('returns a file page\'s server buttons, without its ad and "Copy Link"', async () => {
    const { links } = await expandHubDrive(FILE_URL, answer(fixture('file')));
    assert.equal(links.length, 2);
    assert.equal(links[0].url, 'https://hubcloud.ist/drive/e0ueeuiluu8pire');
    assert.match(links[1].url, /^https:\/\/hubcloud\.ist\/tg\/go\?id=/);
    assert.deepEqual(links.map(({ label }) => label), ['[HubCloud Server]', 'Telegram File']);
  });

  it('leads nowhere from a real file page without servers, without failing', async () => {
    const page = '<table><tr><td>File Size</td><td>1.2 GB</td></tr></table><div class="card-body"><h5>Movie.mkv</h5></div>';
    assert.deepEqual(await expandHubDrive(FILE_URL, answer(page)), { links: [] });
  });

  it('returns a pack\'s rows as file pages, in page order', async () => {
    const { links } = await expandHubDrive(PACK_URL, answer(fixture('pack')));
    assert.equal(links.length, 9);
    assert.deepEqual(links.slice(0, 2).map(({ url }) => url), ['https://hubdrive.bar/file/51828476429', 'https://hubdrive.bar/file/6957876604']);
  });

  it('gives a pack as its header names it and one group: a line per row, labelled by its file, its size its tag', async () => {
    const { links, title, tags, sections } = await expandHubDrive(PACK_URL, answer(fixture('pack')));
    const show = 'Berlin and the Lady with an Ermine (2026)';
    const release = '2160p NF 10bit WEB-DL SDR HEVC [Hindi-Tamil-Telugu DDP 5.1 + English-Spanish DDPA 5.1] H.265 (HHWEB-Ionicboy)';

    assert.equal(title, 'Berlin and the Lady with an Ermine - S01 4K/2160p SDR WEB-DL Packs');
    assert.deepEqual(tags, ['Includes 9 files', 'Total Size: 55.86 GB']);
    assert.deepEqual(sections.map(({ title: group, lines }) => [group, lines.length]), [[null, 9]]);
    assert.deepEqual(sections[0].lines.slice(0, 2).map(({ title: file, tags, links: [link] }) => [file, tags, link.label]), [
      [`${show} S01 ${release}.zip`, ['55.87 GB'], `${show} S01 ${release}.zip`],
      [`${show} S01E01 ${release}.mkv`, ['7.04 GB'], `${show} S01E01 ${release}.mkv`],
    ]);
    assert.deepEqual(sections[0].lines.flatMap((line) => line.links), links);
    assert.ok(links.every(({ label }) => label && !label.includes('HubCloud')));
  });

  it('labels a pack\'s row without a title with its link\'s text', async () => {
    const page = '<div class="pack-clean-file"><a class="pack-clean-link" href="/file/1">Open</a></div>';
    const { links } = await expandHubDrive(PACK_URL, answer(page));
    assert.deepEqual(links.map(({ label }) => label), ['Open']);
  });

  it('is notFound on HubDrive\'s deleted pages', async () => {
    for (const name of ['file-not-found', 'deleted-the-file']) {
      await assert.rejects(expandHubDrive(FILE_URL, answer(fixture(name))), { code: 'notFound', url: FILE_URL });
    }
    await assert.rejects(expandHubDrive(PACK_URL, answer('<h3>File not found !</h3>')), { code: 'notFound' });
  });

  it('is unrecognized for a file page without the file\'s details, or a pack without rows', async () => {
    const challenge = '<html><title>Just a moment...</title><body><h1>Checking your browser</h1></body></html>';
    await assert.rejects(expandHubDrive(FILE_URL, answer(challenge)), { code: 'unrecognized', url: FILE_URL });
    await assert.rejects(expandHubDrive(PACK_URL, answer(challenge)), { code: 'unrecognized', url: PACK_URL });
  });

  it('passes fetching errors on as they are', async () => {
    await assert.rejects(expandHubDrive(PACK_URL, answer('', { status: 404 })), { code: 'notFound' });
  });
});
