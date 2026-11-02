import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { web } from './helpers.js';
import * as entry from '../../src/engine/index.js';

const { createEngine } = entry;

describe('the engine\'s entry', () => {
  it('gives a consumer createEngine, EngineError and identify, and nothing else', () => {
    assert.deepEqual(Object.keys(entry).sort(), ['EngineError', 'createEngine', 'identify']);
  });

  it('makes an engine whose every call has its config', async () => {
    const { fetch, requests } = web({
      'https://new10.hdhub4u.cl/show/': '<h1 class="page-title"><span class="material-text">Show</span></h1>'
        + '<main class="page-body"><h3><a href="https://hubdrive.live/file/7">720p [1GB]</a></h3></main>',
      'https://hubdrive.bar/file/7': '<table><tr><td>File Size</td></tr></table><div class="card-body"><h4><a href="https://hubcloud.foo/drive/a">[HubCloud Server]</a></h4></div>',
    });
    const domains = { hdhub4u: 'https://new10.hdhub4u.cl', hubdrive: 'https://hubdrive.bar', hubcloud: 'https://hubcloud.ist' };
    const engine = createEngine({ domains, fetch });

    const { sections } = await engine.scrapePost('https://new9.hdhub4u.cl/show/');
    const { links: servers } = await engine.expand(sections[0].lines[0].links[0].url);

    assert.deepEqual(requests, ['https://new10.hdhub4u.cl/show/', 'https://hubdrive.bar/file/7']);
    assert.deepEqual(servers, [{ url: 'https://hubcloud.foo/drive/a', label: '[HubCloud Server]' }]);
  });
});
