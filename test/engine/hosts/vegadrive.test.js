import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { answer } from '../helpers.js';
import { resolveVegaDrive } from '../../../engine/hosts/vegadrive.js';

// Live pages (2026-11-03), behind a NexDrive page's "V-Drive [Multi]": a VegaDrive file (Love in
// Disguise S01E04), a zip's (no Vegadrop), and a Vegadrop page.
const fixture = (name) => readFileSync(new URL(`../../fixtures/${name}`, import.meta.url), 'utf8');
const serversOf = (downloads) => downloads.map(({ server, kind, label }) => [server, kind, label]);

function redirectedTo(url) {
  const response = new Response(null);
  Object.defineProperty(response, 'url', { value: url });
  return response;
}

describe('resolveVegaDrive', () => {
  const URL_VD = 'https://one.vegadrive.me/s/2WdhhFFQ9qvp';
  const FILE_URL = 'https://lh3.googleusercontent.com/pw/AP1Gcz=dv';
  // VegaDrive: its file page sets the session's cookie; the Vegadrop page, prepare (answered in
  // turn by `prepared`) and download-link answer only within it.
  function vegadrive({ filePage = fixture('vegadrive-file.html'), prepared = [{ ready: true }], link = { ready: true, download_url: FILE_URL, expires_in_seconds: 120 } } = {}) {
    const requests = [];
    const answers = [...prepared];
    const fetchFn = async (url, init) => {
      const { pathname } = new URL(url);
      const cookie = init.headers.Cookie ?? null;
      requests.push([pathname.split('/')[1] || pathname, cookie]);
      if (pathname.startsWith('/s/')) return new Response(filePage, { headers: { 'set-cookie': 'vegadrive-session=abc; path=/; httponly' } });
      if (cookie !== 'vegadrive-session=abc') return redirectedTo(URL_VD); // as the site, outside the session
      if (pathname.startsWith('/d/')) return new Response(fixture('vegadrive-vegadrop.html'));
      if (pathname.startsWith('/__vega_bridge/prepare/')) return Response.json(answers.shift() ?? { ready: true });
      if (pathname.startsWith('/download-link/')) return typeof link === 'number' ? new Response('', { status: link }) : Response.json(link);
      throw new Error(`No fake answer for ${url}`);
    };
    return { fetch: fetchFn, requests };
  }

  it('reads the file\'s name and size, follows Vegadrop to the file in the page\'s session, and gives the mirrors', async () => {
    const options = vegadrive();

    const file = await resolveVegaDrive(URL_VD, options);

    assert.equal(file.filename, 'Love.in.Disguise.S01E04.720p.WEB-DL.HIN-KOR.x265.ESub-1VeGamovies.tw.mkv');
    assert.equal(file.sizeBytes, Math.round(266.11 * 1024 ** 2));
    assert.deepEqual(serversOf(file.downloads), [
      ['vegadrop', 'direct', 'Vegadrop (10Gbps Direct)'],
      ['telegram', 'page', 'Telegram'],
      ['transferit', 'page', 'Transferit'],
      ['gofile', 'page', 'Gofile'],
      ['buzzheavier', 'page', 'Buzzheavier'],
      ['vikingfile', 'page', 'VikingFile'],
    ]);
    const [vegadrop, telegram] = file.downloads;
    assert.equal(vegadrop.url, FILE_URL);
    assert.equal(telegram.url, 'https://one.vegadrive.me/d/2WdhhFFQ9qvp/telegram');
    assert.deepEqual(options.requests, [
      ['s', null], ['d', 'vegadrive-session=abc'], ['__vega_bridge', 'vegadrive-session=abc'], ['download-link', 'vegadrive-session=abc'],
    ]);
  });

  it('asks again while the link is not ready, as the page does', async () => {
    const options = vegadrive({ prepared: [{ ready: false, retry_after_ms: 1500 }, { ready: true }] });

    const [vegadrop] = (await resolveVegaDrive(URL_VD, options)).downloads;

    assert.equal(vegadrop.kind, 'direct');
    assert.equal(options.requests.filter(([step]) => step === '__vega_bridge').length, 2);
  });

  it('gives Vegadrop\'s button as a page when its steps fail, or lead anywhere but Google', async () => {
    for (const link of [500, { ready: true, download_url: 'https://example.com/a.mkv' }, { ready: true, download_url: 'http://lh3.googleusercontent.com/a' }]) {
      const [vegadrop] = (await resolveVegaDrive(URL_VD, vegadrive({ link }))).downloads;
      assert.deepEqual([vegadrop.kind, vegadrop.url], ['page', 'https://one.vegadrive.me/d/2WdhhFFQ9qvp/skydrop'], JSON.stringify(link));
    }
  });

  it('waits for Vegadrop no longer than its consumer says (waitMs), then gives its button', async () => {
    const options = { ...vegadrive({ prepared: [{ ready: false, retry_after_ms: 1500 }, { ready: true }] }), waitMs: 1000 };

    const [vegadrop] = (await resolveVegaDrive(URL_VD, options)).downloads;

    assert.deepEqual([vegadrop.kind, vegadrop.url], ['page', 'https://one.vegadrive.me/d/2WdhhFFQ9qvp/skydrop']);
    assert.equal(options.requests.filter(([step]) => step === '__vega_bridge').length, 1);
  });

  it('gives a zip\'s mirrors alone: it has no Vegadrop', async () => {
    const file = await resolveVegaDrive('https://one.vegadrive.me/s/J9rF9lOtx80V', vegadrive({ filePage: fixture('vegadrive-zip.html') }));

    assert.equal(file.filename, 'Dead-End.Job.S01.480p.NF.WEB-DL.HIN-KOR.x264.ESub-1VegaMovies.tw.zip');
    assert.deepEqual(serversOf(file.downloads), [['transferit', 'page', 'Transferit']]);
  });

  it('is unrecognized for a page without the file\'s name or size, and notFound for a file that is gone', async () => {
    await assert.rejects(resolveVegaDrive(URL_VD, answer('<title>Just a moment...</title>')), { code: 'unrecognized', url: URL_VD });
    await assert.rejects(resolveVegaDrive(URL_VD, answer('', { status: 404 })), { code: 'notFound' });
  });
});
