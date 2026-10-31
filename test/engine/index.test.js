import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as entry from '../../src/engine/index.js';

const { createEngine } = entry;

// A fake web: each URL answers with its page; it records every request.
function web(pages) {
  const requests = [];
  const fetchFn = async (url) => {
    requests.push(url);
    if (pages[url] === undefined) throw new Error(`No fake page for ${url}`);
    return new Response(pages[url]);
  };
  return { fetch: fetchFn, requests };
}

describe('the engine\'s entry', () => {
  it('gives a consumer createEngine and EngineError, and nothing else', () => {
    assert.deepEqual(Object.keys(entry).sort(), ['EngineError', 'createEngine']);
  });

  it('makes an engine whose every call has its config, and the call\'s own options', async () => {
    const { fetch, requests } = web({
      'https://new10.hdhub4u.cl/show/': '<h1 class="page-title"><span class="material-text">Show</span></h1>'
        + '<main class="page-body"><h3><a href="https://hubdrive.live/file/7">720p [1GB]</a></h3></main>',
      'https://hubdrive.bar/file/7': '<table><tr><td>File Size</td></tr></table><div class="card-body"><h4><a href="https://hubcloud.foo/drive/a">[HubCloud Server]</a></h4></div>',
    });
    const domains = { hdhub4u: 'https://new10.hdhub4u.cl', hubdrive: 'https://hubdrive.bar', hubcloud: 'https://hubcloud.ist' };
    const engine = createEngine({ domains, fetch });
    const events = [];

    const { links } = await engine.scrapePost('https://new9.hdhub4u.cl/show/');
    const { files } = await engine.scrapeLinks(links, { onEvent: (event) => events.push(event.type) });

    assert.deepEqual(requests, ['https://new10.hdhub4u.cl/show/', 'https://hubdrive.bar/file/7']);
    assert.deepEqual(files, [{ host: 'hubcloud', externalId: 'a', url: 'https://hubcloud.ist/drive/a' }]);
    assert.deepEqual(events, ['gateway', 'file']);
  });
});
