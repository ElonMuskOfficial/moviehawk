import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { answer } from '../helpers.js';
import { expandHubLinks } from '../../../src/engine/gateways/hublinks.js';

const URL_HL = 'https://hblinks.lol/archives/1';
// Live pages of each layout (saved 2026-10-28 and 2026-10-29).
const fixture = (name) => readFileSync(new URL(`../../fixtures/hublinks-${name}.html`, import.meta.url), 'utf8');
const urlsOf = async (name) => (await expandHubLinks(URL_HL, answer(fixture(name)))).links.map(({ url }) => url);

describe('expandHubLinks', () => {
  it('returns every link in the content, in page order', async () => {
    // An episode page: one line per quality, "Drive | Instant | Direct".
    const links = await urlsOf('episode-lines');
    assert.equal(links.length, 15);
    assert.deepEqual(links.slice(0, 3), [
      'https://hubdrive.bar/file/1765030262',
      'https://hubcdn.wiki/file/mOmAgdn51xTUPurcnZ1gg9LZB',
      'https://hubcloud.ist/drive/lgfzf1cpxyqfo1l',
    ]);
    assert.equal((await urlsOf('episode-drives')).length, 7);
  });

  it('labels every link by its own text, the line it is on saying what it is for', async () => {
    const labelsOf = async (name) => (await expandHubLinks(URL_HL, answer(fixture(name)))).links.map(({ label }) => label);

    assert.deepEqual((await labelsOf('episode-lines')).slice(0, 4), ['Drive', 'Instant', 'Direct', 'Drive']);
    assert.deepEqual((await labelsOf('episode-drives')).slice(0, 2), ['Episode 1 – 7.2GB', 'Episode 2 – 5.8GB']);
  });

  it('reads links shown as logos without text, without a label', async () => {
    const { links } = await expandHubLinks(URL_HL, answer(fixture('logos')));
    assert.deepEqual(links.map(({ label }) => label), [null, null, null]);
    assert.deepEqual(await urlsOf('logos'), [
      'https://hubcloud.ist/drive/aiiikkiqbe8qae4',
      'https://hubdrive.bar/file/2330045630',
      'https://gofile.io/d/v7ipQif',
    ]);
  });

  it('returns links to hosts the engine does not know, and torrents, as they are', async () => {
    const legacy = await urlsOf('legacy-hosts');
    assert.equal(legacy.length, 23);
    assert.equal(legacy[0], 'https://uploadbaz.me/n4riqrhm43qd');
    const [torrent] = await urlsOf('torrent-only');
    assert.match(torrent, /^magnet:\?xt=urn:btih:91e696cc/);
  });

  it('gives the page\'s title as it is, the only place it names the file', async () => {
    const { title } = await expandHubLinks(URL_HL, answer(fixture('logos')));
    assert.equal(title, 'The Terminal List: Dark Wolf S01 480p Pack – HUBLinks');
  });

  it('groups the links as the page does: a group per <hr>, titled by its first block of text', async () => {
    // Mirrors, then "Watch Online": groups split by <hr>; a mirror's text is its URL.
    const { links, sections } = await expandHubLinks(URL_HL, answer(fixture('legacy-hosts')));

    assert.deepEqual(sections.map(({ title, lines }) => [title, lines.length]), [[null, 8], [null, 13], ['Watch Online', 2]]);
    assert.deepEqual(sections[0].lines[0], { title: 'Drive [LinkST 1]', links: [{ url: links[0].url, label: 'Drive [LinkST 1]' }], tags: [] });
    assert.deepEqual(sections.flatMap(({ lines }) => lines.flatMap((line) => line.links.map(({ url }) => url))), links.map(({ url }) => url));
  });

  it('titles a line of several buttons by its text before them, and a logo\'s line by none', async () => {
    const episode = await expandHubLinks(URL_HL, answer(fixture('episode-lines')));
    const logos = await expandHubLinks(URL_HL, answer(fixture('logos')));

    assert.deepEqual(episode.sections[0].lines.map(({ title, links }) => [title, links.map(({ label }) => label)]), [['480p', ['Drive', 'Instant', 'Direct']]]);
    assert.deepEqual(logos.sections.map(({ lines }) => lines.map(({ title, links }) => [title, links.map(({ label }) => label)])), [[[null, [null]]], [[null, [null]]], [[null, [null]]]]);
  });

  it('puts a link in no block in a line of its own, and reads a wrapper\'s blocks, not the wrapper', async () => {
    const page = `<div class="entry-content"><div><p>Watch Online</p><p><a href="https://a.example/1">a.example/1</a> <a href="https://b.example/2">b.example/2</a></p></div>
      <hr><a href="https://c.example/3">Instant</a></div>`;

    const { sections } = await expandHubLinks(URL_HL, answer(page));

    assert.deepEqual(sections.map(({ title, lines }) => [title, lines.map(({ title: line, links }) => [line, links.length])]), [
      ['Watch Online', [[null, 2]]],
      [null, [['Instant', 1]]],
    ]);
  });

  it('leads nowhere from a removed page, without failing', async () => {
    assert.deepEqual(await urlsOf('removed'), []);
  });

  it('resolves relative links against the page\'s address after redirects', async () => {
    const page = '<div class="entry-content"><a href="/archives/2">Instant</a></div>';
    const { links } = await expandHubLinks('https://hblinks.pro/archives/1', answer(page, { url: 'https://hblinks.lol/archives/1' }));
    assert.deepEqual(links.map(({ url }) => url), ['https://hblinks.lol/archives/2']);
  });

  it('is unrecognized for a page without the content area', async () => {
    const page = '<html><body><a href="https://hubcloud.ist/drive/abc">Download</a></body></html>';
    await assert.rejects(expandHubLinks(URL_HL, answer(page)), { code: 'unrecognized', url: URL_HL });
  });

  it('passes fetching errors on as they are', async () => {
    await assert.rejects(expandHubLinks(URL_HL, answer('', { status: 404 })), { code: 'notFound' });
  });
});
