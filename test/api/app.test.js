import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildApp } from '../../src/api/app.js';
import { EngineError } from '../../src/engine/index.js';

// The app, with routes of the test's own added before it is ready. Its engine is never called.
async function app(addRoutes = () => {}) {
  const domains = { hdhub4u: 'https://new10.hdhub4u.cl', '4khdhub': 'https://4khdhub.one' };
  const server = await buildApp({ config: { current: () => ({ engine: {}, domains }) } });
  addRoutes(server);
  await server.ready();
  return server;
}

const PROBLEM = 'application/problem+json; charset=utf-8';

describe('the API server', () => {
  it('gives every response its own Request-Id, and never takes the client\'s', async (t) => {
    const server = await app((s) => s.get('/ok', () => ({ ok: true })));
    t.after(() => server.close());

    const first = await server.inject({ url: '/ok', headers: { 'request-id': 'chosen-by-client' } });
    const second = await server.inject('/ok');
    const missing = await server.inject('/no-such-route');

    for (const response of [first, second, missing]) assert.match(response.headers['request-id'], /^[0-9a-f-]{36}$/);
    assert.notEqual(first.headers['request-id'], second.headers['request-id']);
  });

  it('answers a route it does not have with a 404 problem', async (t) => {
    const server = await app();
    t.after(() => server.close());

    const response = await server.inject('/v1/nothing');

    assert.equal(response.statusCode, 404);
    assert.equal(response.headers['content-type'], PROBLEM);
    assert.deepEqual(response.json(), {
      type: 'about:blank', title: 'Not Found', status: 404, detail: 'No route GET /v1/nothing', code: 'notFound',
    });
  });

  it('gives an EngineError as a problem with its status and code', async (t) => {
    const cases = {
      notFound: [404, 'Not Found'],
      unsupported: [400, 'Bad Request'],
      unrecognized: [502, 'Bad Gateway'],
      transient: [504, 'Gateway Timeout'],
    };
    const server = await app((s) => s.get('/fail/:code', (request) => {
      throw new EngineError(request.params.code, `The site said ${request.params.code}`, { url: 'https://site.example/a' });
    }));
    t.after(() => server.close());

    for (const [code, [status, title]] of Object.entries(cases)) {
      const response = await server.inject(`/fail/${code}`);
      assert.equal(response.statusCode, status, code);
      assert.equal(response.headers['content-type'], PROBLEM);
      assert.deepEqual(response.json(), { type: 'about:blank', title, status, detail: `The site said ${code}`, code });
    }
  });

  it('gives a request its schema rejects as a 400 invalidArgument problem', async (t) => {
    const server = await app((s) => s.get('/list', {
      schema: { querystring: { type: 'object', properties: { pageToken: { type: 'integer', minimum: 1 } } } },
    }, () => ({ ok: true })));
    t.after(() => server.close());

    const response = await server.inject('/list?pageToken=zero');

    assert.equal(response.statusCode, 400);
    assert.equal(response.headers['content-type'], PROBLEM);
    assert.equal(response.json().code, 'invalidArgument');
    assert.match(response.json().detail, /pageToken/);
  });

  it('gives any other error as a 500 problem, without its message', async (t) => {
    const server = await app((s) => s.get('/bug', () => {
      throw new TypeError('secret internals');
    }));
    t.after(() => server.close());

    const response = await server.inject('/bug');

    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.json(), {
      type: 'about:blank', title: 'Internal Server Error', status: 500, detail: 'The API failed to answer', code: 'internal',
    });
  });

  it('routes a name as long as a GreenMotors link\'s, and gives a longer one as a problem', async (t) => {
    const server = await app((s) => s.get('/v1/links/:link', (request) => ({ length: request.params.link.length })));
    t.after(() => server.close());

    const long = await server.inject(`/v1/links/${'a'.repeat(540)}`);
    const tooLong = await server.inject(`/v1/links/${'a'.repeat(3000)}`);

    assert.deepEqual(long.json(), { length: 540 });
    assert.equal(tooLong.statusCode, 414);
    assert.equal(tooLong.headers['content-type'], PROBLEM);
    assert.equal(tooLong.json().code, 'invalidArgument');
    assert.match(tooLong.headers['request-id'], /^[0-9a-f-]{36}$/);
  });

  it('gives a URL that does not decode as a 400 problem', async (t) => {
    const server = await app();
    t.after(() => server.close());

    const response = await server.inject('/v1/sites/hdhub4u/posts/wall%c2%b-2008');

    assert.equal(response.statusCode, 400);
    assert.equal(response.headers['content-type'], PROBLEM);
    assert.equal(response.json().code, 'invalidArgument');
  });
});
