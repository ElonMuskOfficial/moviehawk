import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { answer } from '../helpers.js';
import { expandNexDrive } from '../../../engine/gateways/nexdrive.js';

const URL_ND = 'https://nexdrive.beer/genxfm784776189733/';
// Live pages (2026-11-03): a season's (a zip and each episode, 2020), a movie's (2019), one with a
// box of other mirrors (2021), one whose episodes are links of plain paragraphs (2020).
const fixture = (name) => readFileSync(new URL(`../../fixtures/${name}`, import.meta.url), 'utf8');
const shapeOf = (sections) => sections.map(({ title, lines }) => [title, lines.map((line) => [line.title, line.links.map(({ label }) => label)])]);

describe('expandNexDrive', () => {
  it('gives a season\'s page: its title, a line per episode titled by its heading, its servers as links', async () => {
    const page = await expandNexDrive(URL_ND, answer(fixture('nexdrive-episodes.html')));

    assert.equal(page.title, 'Killer Ratings (Season-1) Hindi 720p (Episode 1-7) [550MB]');
    assert.deepEqual(page.tags, []);
    const servers = ['⚡ V-Cloud [Resumable]', 'G-Drive [Login]'];
    assert.deepEqual(shapeOf(page.sections), [[null, [
      ['-:Complete Zip Pack:-', servers],
      ...['1', '02', '03', '04', '05', '06', '07'].map((n) => [`-:Episodes: ${n}:-`, servers]),
    ]]]);
    assert.equal(page.links.length, 16);
    assert.match(page.links[0].url, /^https:\/\/vcloud\.beer\/[\w-]+$/);
    for (const line of page.sections[0].lines) assert.deepEqual(line.tags, []);
  });

  it('gives a movie\'s one line untitled: the page\'s note and a divider are between them', async () => {
    const page = await expandNexDrive(URL_ND, answer(fixture('nexdrive-movie.html')));

    assert.equal(page.title, 'Bypass Road (2019) Hindi 480p [400MB]');
    assert.deepEqual(shapeOf(page.sections), [[null, [[null, ['⚡ G-Direct [Instant]', '⚡ V-Cloud [Resumable]', '⚡ Drop [Best] ⚡']]]]]);
    assert.deepEqual(page.links.map(({ url }) => new URL(url).hostname), ['fastdl.beer', 'vcloud.beer', 'dropgalaxy.vip']);
  });

  it('gives a box of other mirrors as its own group, titled as the box is', async () => {
    const page = await expandNexDrive(URL_ND, answer(fixture('nexdrive-mirrors.html')));

    assert.deepEqual(page.sections.map(({ title, lines }) => [title, lines.length, lines[0].links.length]), [[null, 1, 6], ['Alternative Sources', 1, 5]]);
    assert.deepEqual(page.sections[1].lines[0].links[1], { url: 'https://gofile.io/d/NsoO6b', label: 'https://gofile.io/d/NsoO6b' });
  });

  it('gives a paragraph of episode links as a line, each link by its episode', async () => {
    const page = await expandNexDrive(URL_ND, answer(fixture('nexdrive-plain.html')));

    assert.deepEqual(page.sections[0].lines.map(({ links }) => links.map(({ label }) => label)), [
      ['Episode 1', 'Episode 2', 'Episode 3', 'Episode 4'],
      ['Episode 5', 'Episode 6', 'Episode 7', 'Episode 8'],
      ['Episode 9', 'Episode 10'],
    ]);
  });

  it('is unrecognized for a page without its content, and notFound for a page that is gone', async () => {
    await assert.rejects(expandNexDrive(URL_ND, answer('<title>Just a moment...</title>')), { code: 'unrecognized', url: URL_ND });
    await assert.rejects(expandNexDrive(URL_ND, answer('', { status: 404 })), { code: 'notFound' });
  });
});
