import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { answer } from '../helpers.js';
import { resolveVCloud } from '../../../engine/hosts/vcloud.js';

// Live pages (2026-11-03), behind a NexDrive page: a V-Cloud file (Spider-Man: Brand New Day
// 720p), its download page, and another file's download page (with GoFile and Telegram).
const fixture = (name) => readFileSync(new URL(`../../fixtures/${name}`, import.meta.url), 'utf8');
const serversOf = (downloads) => downloads.map(({ server, kind, label }) => [server, kind, label]);

function redirectedTo(url) {
  const response = new Response(null);
  Object.defineProperty(response, 'url', { value: url });
  return response;
}

describe('resolveVCloud', () => {
  const URL_VC = 'https://vcloud.beer/uthhuboxjuitfuz';
  const GOOGLE = 'https://video-downloads.googleusercontent.com/ADGPM2l';
  // V-Cloud answers its file page and, with ?token=, its download page; 10Gbps redirects to an ad
  // page whose `link` is the file's URL, as HubCloud's.
  function vcloud({ downloadPage = fixture('vcloud-download.html') } = {}) {
    const requests = [];
    const fetchFn = async (url, init) => {
      const parsed = new URL(url);
      requests.push([parsed.hostname, parsed.searchParams.has('token') ? 'download page' : parsed.pathname, init.method]);
      if (parsed.hostname === 'vcloud.beer') return new Response(parsed.searchParams.has('token') ? downloadPage : fixture('vcloud-file.html'));
      if (parsed.hostname === 'gpdl2.hubcloud.ist') return redirectedTo(`https://cryptonewz.online/dl.php?link=${GOOGLE}`);
      throw new Error(`No fake answer for ${url}`);
    };
    return { fetch: fetchFn, requests };
  }

  it('reads the file card, then the download page its script links (base64 of base64), as HubCloud\'s', async () => {
    const options = vcloud();

    const file = await resolveVCloud(URL_VC, options);

    assert.equal(file.filename, 'Spider-Man.Brand.New.Day.2026.iMAX.720p.WEB-DL.Hindi-English.ESub.x264-1VegaMovies.tw.mkv');
    assert.equal(file.sizeBytes, Math.round(1.29 * 1024 ** 3));
    assert.deepEqual(serversOf(file.downloads), [
      ['fsl', 'direct', 'Download [FSL Server]'],
      ['pixeldrain', 'page', 'Download [PixelServer : 2]'],
      ['10gbps', 'direct', 'Download [Server : 10Gbps]'],
    ]);
    // PixelServer's own `href` is the decoy: the page's script sets the file's.
    assert.equal(file.downloads[1].url, 'https://pixeldrain.dev/u/okM7MwQ9');
    assert.equal(file.downloads[2].url, GOOGLE);
    assert.deepEqual(options.requests.map(([host, page]) => [host, page]), [
      ['vcloud.beer', '/uthhuboxjuitfuz'], ['vcloud.beer', 'download page'], ['gpdl2.hubcloud.ist', '/'],
    ]);
  });

  it('knows V-Cloud\'s own servers: GoFile, and Telegram as it spells it', async () => {
    const file = await resolveVCloud(URL_VC, vcloud({ downloadPage: fixture('vcloud-download-servers.html') }));

    assert.deepEqual(serversOf(file.downloads).map(([server]) => server), ['fslv2', 'pixeldrain', 'gofile', '10gbps', 'telegram']);
  });

  it('is unrecognized for a file page without the file\'s card or its download link', async () => {
    const card = '<div class="card-header">a.mkv</div><i id="size">1 GB</i>';
    for (const page of ['<title>Just a moment...</title>', card, `${card}<script>var url = atob(atob('bm90IGEgdXJs'));</script>`]) {
      await assert.rejects(resolveVCloud(URL_VC, answer(page)), { code: 'unrecognized', url: URL_VC });
    }
  });
});
