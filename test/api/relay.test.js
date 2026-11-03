import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildApp } from '../../src/setup.js';
import { isRelayed, relayFetch } from '../../src/relay.js';
import { DOMAINS } from './helpers.js';

const FILE = 'https://vcloud.beer/rssbbah1rbs1hay';

// V-Cloud, as the relay's own fetch: its page, at the address its redirects end at; every request
// recorded with its method and headers.
function vcloud({ status = 200, body = '<div class="card-header">a.mkv</div>', finalUrl = FILE } = {}) {
  const requests = [];
  const fetchFn = async (url, init) => {
    requests.push({ url, method: init.method, headers: init.headers });
    const response = new Response(init.method === 'HEAD' ? null : body, { status, headers: { 'content-type': 'text/html; charset=UTF-8' } });
    Object.defineProperty(response, 'url', { value: finalUrl });
    return response;
  };
  return { fetch: fetchFn, requests };
}

async function relayWith(site) {
  const app = await buildApp({ engine: {}, domains: DOMAINS, relayFetch: site.fetch });
  await app.ready();
  return app;
}

describe('the relay', () => {
  it('reads a V-Cloud page as the site answers it, with the request\'s identity, Referer and cookie', async (t) => {
    const site = vcloud({ finalUrl: `${FILE}?moved` });
    const app = await relayWith(site);
    t.after(() => app.close());

    const response = await app.inject({
      url: `/v1/relay?url=${encodeURIComponent(FILE)}`,
      headers: { 'user-agent': 'Mozilla/5.0 Test', referer: 'https://vcloud.beer/', cookie: 'xla=sod', 'x-other': 'not passed' },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body, '<div class="card-header">a.mkv</div>');
    assert.match(response.headers['content-type'], /^text\/html/);
    assert.equal(response.headers['x-relay-url'], `${FILE}?moved`);
    assert.deepEqual(site.requests, [{ url: FILE, method: 'GET', headers: { 'user-agent': 'Mozilla/5.0 Test', referer: 'https://vcloud.beer/', cookie: 'xla=sod' } }]);
  });

  it('answers with the site\'s own status, a HEAD with no body', async (t) => {
    const blocked = await relayWith(vcloud({ status: 403, body: 'Forbidden' }));
    t.after(() => blocked.close());

    const response = await blocked.inject({ url: `/v1/relay?url=${encodeURIComponent(FILE)}` });
    const head = await blocked.inject({ method: 'HEAD', url: `/v1/relay?url=${encodeURIComponent(FILE)}` });

    assert.deepEqual([response.statusCode, response.body], [403, 'Forbidden']);
    assert.deepEqual([head.statusCode, head.body], [403, '']);
  });

  it('reads V-Cloud only: any other site, or no URL, is HTTP 400, and asks no site', async (t) => {
    const site = vcloud();
    const app = await relayWith(site);
    t.after(() => app.close());

    for (const url of ['https://hubcloud.ist/drive/a', 'https://example.com/?vcloud.beer', 'file:///etc/passwd', 'not a url']) {
      const response = await app.inject({ url: `/v1/relay?url=${encodeURIComponent(url)}` });
      assert.equal(response.statusCode, 400, url);
      assert.equal(response.json().code, 'invalidArgument', url);
    }
    assert.equal((await app.inject({ url: '/v1/relay' })).statusCode, 400);
    assert.deepEqual(site.requests, []);
  });
});

describe('relayFetch', () => {
  it('sends V-Cloud\'s requests through the relay, every other one as it is', async () => {
    const asked = [];
    const fetchFn = async (url, init) => {
      asked.push([url, init.method ?? 'GET']);
      if (url.startsWith('https://relay.example/')) {
        return new Response('<div>page</div>', { status: 200, headers: { 'x-relay-url': `${FILE}?moved` } });
      }
      return new Response('other');
    };
    const relayed = relayFetch('https://relay.example', fetchFn);

    const page = await relayed(FILE, { headers: { Referer: 'https://vcloud.beer/' } });
    const other = await relayed('https://hubcloud.ist/drive/a', {});

    assert.deepEqual([page.status, await page.text(), page.url], [200, '<div>page</div>', `${FILE}?moved`]);
    assert.equal(await other.text(), 'other');
    assert.deepEqual(asked, [[`https://relay.example/v1/relay?url=${encodeURIComponent(FILE)}`, 'GET'], ['https://hubcloud.ist/drive/a', 'GET']]);
  });

  it('gives the site\'s status as it is: a 403 stays a 403', async () => {
    const relayed = relayFetch('https://relay.example', async () => new Response('Forbidden', { status: 403 }));

    assert.equal((await relayed(FILE, {})).status, 403);
  });

  it('knows V-Cloud by its hostname label, on any of its domains', () => {
    assert.deepEqual(['https://vcloud.beer/a', 'https://vcloud.zip/a', 'https://hubcloud.ist/a', 'https://example.com/vcloud'].map(isRelayed), [true, true, false, false]);
  });
});
