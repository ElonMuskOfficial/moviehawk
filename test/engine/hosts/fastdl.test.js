import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { answer } from '../helpers.js';
import { resolveFastDl } from '../../../engine/hosts/fastdl.js';

// A live FastDL file page (2026-11-03), behind a NexDrive page's "G-Direct [Instant]".
const fixture = (name) => readFileSync(new URL(`../../fixtures/${name}`, import.meta.url), 'utf8');
const serversOf = (downloads) => downloads.map(({ server, kind, label }) => [server, kind, label]);

describe('resolveFastDl', () => {
  const URL_FD = 'https://fastdl.beer/embed.php?download=qc1yQwPih2N6nukpUb7dz0rOw';
  function fastdl({ page = fixture('fastdl-file.html'), head = { 'content-length': '1382756860', 'content-disposition': 'attachment; filename="Spider-Man.mkv"' } } = {}) {
    const requests = [];
    const fetchFn = async (url, init) => {
      const { hostname } = new URL(url);
      requests.push([hostname, init.method]);
      if (hostname === 'fastdl.beer') return new Response(page);
      if (hostname === 'video-downloads.googleusercontent.com') return typeof head === 'number' ? new Response(null, { status: head }) : new Response(null, { headers: head });
      throw new Error(`No fake answer for ${url}`);
    };
    return { fetch: fetchFn, requests };
  }

  it('reads the file\'s URL from the page\'s script, and its name and size from its headers (a HEAD)', async () => {
    const options = fastdl();

    const file = await resolveFastDl(URL_FD, options);

    assert.deepEqual({ ...file, downloads: serversOf(file.downloads) }, {
      filename: 'Spider-Man.mkv',
      sizeBytes: 1382756860,
      downloads: [['fastdl', 'direct', 'Download [FastDL]']],
    });
    assert.match(file.downloads[0].url, /^https:\/\/video-downloads\.googleusercontent\.com\//);
    assert.deepEqual(options.requests, [['fastdl.beer', 'GET'], ['video-downloads.googleusercontent.com', 'HEAD']]);
  });

  it('still gives the download when the headers cannot be read', async () => {
    const file = await resolveFastDl(URL_FD, fastdl({ head: 403 }));

    assert.deepEqual([file.filename, file.sizeBytes, file.downloads.length], [null, null, 1]);
  });

  it('is notFound for FastDL\'s deleted page, and unrecognized for a page without the link', async () => {
    const deleted = '<title>Something went wrong ..</title><h4>File is Deleted or UnAvailable....</h4>';

    await assert.rejects(resolveFastDl(URL_FD, answer(deleted)), { code: 'notFound', url: URL_FD });
    await assert.rejects(resolveFastDl(URL_FD, answer('<title>Just a moment...</title>')), { code: 'unrecognized', url: URL_FD });
    await assert.rejects(resolveFastDl(URL_FD, answer('<script>var reurl = "https://fastdl.beer/dl.php";</script>')), { code: 'unrecognized' });
  });
});
