import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildApp } from '../../src/api/app.js';
import { EngineError } from '../../src/engine/index.js';

const domains = { hdhub4u: 'https://new10.hdhub4u.cl', '4khdhub': 'https://4khdhub.one' };
const id = (url) => Buffer.from(url).toString('base64url');

// An engine whose `method` answers with `answer`, recording how it was called.
function fakeEngine(method, answer) {
  const calls = [];
  return {
    engine: { [method]: async (...args) => { calls.push(args); return answer(...args); } },
    calls,
  };
}

async function app(engine) {
  const server = await buildApp({ config: { current: () => ({ engine, domains }) } });
  await server.ready();
  return server;
}

const LINK = 'https://greenmotors.club/?id=cUk4cEpVbFU1NW8yUVR1ZVFUM3phNm5QS2Z3TTdCSkVpS1pqdjdkTHQ5bDlqUGNSMTVIWDk5d05BZDVIa3R2QnpzaG9sUGlWYWgyY3A5eVRVeVBaTlVwYVVuUkxNZXZBRG9rbDZqQldYWmc9';
const HUBCLOUD = 'https://hubcloud.ist/drive/xukqlp6jbsf8wja';

describe('ListFiles', () => {
  it('follows the link its name stands for, and names each file by its URL', async (t) => {
    const { engine, calls } = fakeEngine('scrapeLinks', () => ({
      files: [
        { host: 'hubcloud', externalId: 'xukqlp6jbsf8wja', url: HUBCLOUD, label: '[HubCloud Server]' },
        { host: 'multicloudlinks', externalId: 'c8y5e2', url: 'https://new2.multicloudlinks.com/view/c8y5e2', label: null },
      ],
      failures: [new EngineError('notFound', 'HubDrive says the file is gone', { url: 'https://hubdrive.bar/file/1997118795' })],
    }));
    const server = await app(engine);
    t.after(() => server.close());

    const response = await server.inject(`/v1/links/${id(LINK)}/files`);

    assert.deepEqual(calls, [[[LINK]]]);
    assert.deepEqual(response.json(), {
      files: [
        { name: 'files/aHR0cHM6Ly9odWJjbG91ZC5pc3QvZHJpdmUveHVrcWxwNmpic2Y4d2ph', host: 'hubcloud', url: HUBCLOUD, label: '[HubCloud Server]' },
        { name: 'files/aHR0cHM6Ly9uZXcyLm11bHRpY2xvdWRsaW5rcy5jb20vdmlldy9jOHk1ZTI', host: 'multicloudlinks', url: 'https://new2.multicloudlinks.com/view/c8y5e2', label: null },
      ],
      failures: [{ code: 'notFound', url: 'https://hubdrive.bar/file/1997118795', detail: 'HubDrive says the file is gone' }],
    });
  });

  it('gives a name the API did not make as 400, and asks the engine nothing', async (t) => {
    const { engine, calls } = fakeEngine('scrapeLinks', () => ({ files: [], failures: [] }));
    const server = await app(engine);
    t.after(() => server.close());

    const notBase64 = `${id(LINK)}!!`; // Node would decode it, skipping the "!!"
    for (const bad of [notBase64, id('not a url'), id('javascript:alert(1)'), id('ftp://files.example/a')]) {
      const response = await server.inject(`/v1/links/${encodeURIComponent(bad)}/files`);
      assert.equal(response.statusCode, 400, bad);
      assert.equal(response.json().code, 'invalidArgument', bad);
    }
    assert.deepEqual(calls, []);
  });
});

describe('GetFile', () => {
  it('resolves the file its name stands for', async (t) => {
    const downloads = [
      { server: 'fsl', kind: 'direct', url: 'https://example.r2.cloudflarestorage.com/hub/a', label: 'Download [FSL Server]' },
      { server: 'pixeldrain', kind: 'page', url: 'https://pixeldrain.dev/u/negn6f', label: 'Download [PixelServer : 2]' },
    ];
    const { engine, calls } = fakeEngine('resolve', () => ({
      filename: 'Wrong.Turn.2003.720p.BluRay.Hindi.English.DD5.1.x264.ESubs.mkv', sizeBytes: 890922598, downloads,
    }));
    const server = await app(engine);
    t.after(() => server.close());

    const response = await server.inject(`/v1/files/${id(HUBCLOUD)}`);

    assert.deepEqual(calls, [[HUBCLOUD]]);
    assert.deepEqual(response.json(), {
      name: `files/${id(HUBCLOUD)}`,
      filename: 'Wrong.Turn.2003.720p.BluRay.Hindi.English.DD5.1.x264.ESubs.mkv',
      sizeBytes: 890922598,
      downloads,
    });
  });

  it('gives a file of a host the engine does not resolve as 400 unsupported, and a gone file as 404', async (t) => {
    const { engine } = fakeEngine('resolve', (url) => {
      if (url.includes('gofile')) throw new EngineError('unsupported', 'The engine does not resolve files of gofile', { url });
      throw new EngineError('notFound', 'HubCloud says the file is gone', { url });
    });
    const server = await app(engine);
    t.after(() => server.close());

    const gofile = await server.inject(`/v1/files/${id('https://gofile.io/d/abc')}`);
    const gone = await server.inject(`/v1/files/${id('https://hubcloud.ist/drive/gone123')}`);

    assert.equal(gofile.statusCode, 400);
    assert.equal(gofile.json().code, 'unsupported');
    assert.equal(gone.statusCode, 404);
    assert.equal(gone.json().code, 'notFound');
  });

  it('gives a name the API did not make as 400, and asks the engine nothing', async (t) => {
    const { engine, calls } = fakeEngine('resolve', () => ({}));
    const server = await app(engine);
    t.after(() => server.close());

    const response = await server.inject(`/v1/files/${id('hubcloud.ist/drive/abc')}`);

    assert.equal(response.statusCode, 400);
    assert.equal(response.json().code, 'invalidArgument');
    assert.deepEqual(calls, []);
  });
});
