import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EngineError } from '../../src/engine/errors.js';
import { fetchHtml, fetchJson, followRedirects, retry } from '../../src/engine/http.js';

const URL_A = 'https://hubcloud.ist/drive/abc';

// A fake fetch that answers every request with `status` and `body`, and records the requests.
function answer(status, body = '<html></html>', { url = URL_A } = {}) {
  const requests = [];
  const fetchFn = async (requestUrl, init) => {
    requests.push({ url: requestUrl, init });
    const response = new Response(body, { status });
    Object.defineProperty(response, 'url', { value: url });
    return response;
  };
  return { fetchFn, requests };
}

// A fake fetch that never answers until its signal aborts, like a stalled host.
const stall = (requestUrl, { signal }) => new Promise((resolve, reject) => {
  signal.addEventListener('abort', () => reject(signal.reason));
});

const rejectsWith = (promise, code, status = null) => assert.rejects(promise, (error) => {
  assert.ok(error instanceof EngineError);
  assert.equal(error.code, code);
  assert.equal(error.status, status);
  assert.equal(error.url, URL_A);
  return true;
});

describe('fetchHtml', () => {
  it('returns the HTML and the address after redirects', async () => {
    const { fetchFn } = answer(200, '<h1>File</h1>', { url: 'https://hubcloud.ist/drive/abc?moved' });

    const page = await fetchHtml(URL_A, { fetch: fetchFn });

    assert.deepEqual(page, { html: '<h1>File</h1>', url: 'https://hubcloud.ist/drive/abc?moved' });
  });

  it('asks as a browser, following redirects', async () => {
    const { fetchFn, requests } = answer(200);

    await fetchHtml(URL_A, { fetch: fetchFn });

    const { init } = requests[0];
    assert.equal(init.redirect, 'follow');
    assert.match(init.headers['User-Agent'], /^Mozilla\/5\.0 /);
    assert.match(init.headers.Accept, /^text\/html/);
  });

  it('is notFound on HTTP 404 and 410: the site said the page is gone', async () => {
    await rejectsWith(fetchHtml(URL_A, { fetch: answer(404).fetchFn }), 'notFound', 404);
    await rejectsWith(fetchHtml(URL_A, { fetch: answer(410).fetchFn }), 'notFound', 410);
  });

  it('is transient on any other HTTP error', async () => {
    for (const status of [403, 429, 500, 503]) {
      await rejectsWith(fetchHtml(URL_A, { fetch: answer(status).fetchFn }), 'transient', status);
    }
  });

  it('cancels the body of an error answer, so the connection is freed', async () => {
    let cancelled = false;
    const body = new ReadableStream({ cancel: () => { cancelled = true; } });
    const fetchFn = async () => new Response(body, { status: 500 });

    await assert.rejects(fetchHtml(URL_A, { fetch: fetchFn }));

    assert.equal(cancelled, true);
  });

  it('is transient on a network error, keeping it as the cause', async () => {
    const networkError = new TypeError('fetch failed');
    const fetchFn = async () => { throw networkError; };

    await assert.rejects(fetchHtml(URL_A, { fetch: fetchFn }), (error) => {
      assert.equal(error.code, 'transient');
      assert.equal(error.cause, networkError);
      return true;
    });
  });

  it('is transient when the host does not answer within the timeout', async () => {
    await assert.rejects(fetchHtml(URL_A, { fetch: stall, timeoutMs: 20 }), (error) => {
      assert.equal(error.code, 'transient');
      assert.equal(error.message, 'No answer within 20 ms');
      return true;
    });
  });

  it('times out while the body is read too', async () => {
    // Headers arrive at once; the body never ends until the request is aborted.
    const fetchFn = async (requestUrl, { signal }) => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('<html>'));
        signal.addEventListener('abort', () => controller.error(signal.reason));
      },
    }));

    await assert.rejects(fetchHtml(URL_A, { fetch: fetchFn, timeoutMs: 20 }), { code: 'transient' });
  });

  it('passes the caller\'s cancellation on as it is, not as an EngineError', async () => {
    const controller = new AbortController();
    const reason = new DOMException('The user left', 'AbortError');
    setTimeout(() => controller.abort(reason), 10);

    await assert.rejects(fetchHtml(URL_A, { fetch: stall, signal: controller.signal }), (error) => error === reason);
  });
});

describe('fetchJson', () => {
  it('returns the parsed JSON, with the headers a site asks for on top of the engine\'s', async () => {
    const { fetchFn, requests } = answer(200, '{"found":1}');

    assert.deepEqual(await fetchJson(URL_A, { fetch: fetchFn, headers: { Referer: 'https://new10.hdhub4u.cl/' } }), { found: 1 });
    assert.equal(requests[0].init.headers.Referer, 'https://new10.hdhub4u.cl/');
    assert.match(requests[0].init.headers['User-Agent'], /^Mozilla\/5\.0/);
  });

  it('is unrecognized for an answer that is not JSON, such as a challenge page', async () => {
    const { fetchFn } = answer(200, '<html><title>Just a moment...</title></html>');
    await rejectsWith(fetchJson(URL_A, { fetch: fetchFn }), 'unrecognized');
  });
});

describe('followRedirects', () => {
  it('returns where the redirects end, asking for no body', async () => {
    const { fetchFn, requests } = answer(200, '', { url: 'https://cryptonewz.online/dl.php?link=x' });

    assert.equal(await followRedirects(URL_A, { fetch: fetchFn }), 'https://cryptonewz.online/dl.php?link=x');
    assert.equal(requests[0].init.method, 'HEAD');
    assert.equal(requests[0].init.redirect, 'follow');
  });

  it('fails like fetchHtml: notFound on HTTP 404, transient on the timeout', async () => {
    await rejectsWith(followRedirects(URL_A, { fetch: answer(404).fetchFn }), 'notFound', 404);
    await assert.rejects(followRedirects(URL_A, { fetch: stall, timeoutMs: 20 }), { code: 'transient' });
  });
});

describe('retry', () => {
  const failing = (codes) => {
    let calls = 0;
    const fn = async () => {
      const code = codes[calls++];
      if (code) throw new EngineError(code, code);
      return 'page';
    };
    return { fn, calls: () => calls };
  };

  it('tries again after transient and unrecognized failures', async () => {
    const { fn, calls } = failing(['transient', 'unrecognized']);

    assert.equal(await retry(fn, { delayMs: 1 }), 'page');
    assert.equal(calls(), 3);
  });

  it('gives up after 3 tries with the last error', async () => {
    const { fn, calls } = failing(['transient', 'transient', 'transient', 'transient']);

    await assert.rejects(retry(fn, { delayMs: 1 }), { code: 'transient' });
    assert.equal(calls(), 3);
  });

  it('does not try again when the site said the page is gone', async () => {
    const { fn, calls } = failing(['notFound']);
    await assert.rejects(retry(fn, { delayMs: 1 }), { code: 'notFound' });
    assert.equal(calls(), 1);
  });

  it('does not try again after an error that is not an EngineError (a bug, or a cancellation)', async () => {
    let calls = 0;
    const bug = new TypeError('Cannot read properties of undefined');
    const fn = async () => { calls++; throw bug; };

    await assert.rejects(retry(fn, { delayMs: 1 }), (error) => error === bug);
    assert.equal(calls, 1);
  });

  it('waits delayMs, then four times as long', async () => {
    const { fn } = failing(['transient', 'transient']);
    const start = performance.now();

    await retry(fn, { delayMs: 20 });

    // 20 ms + 80 ms between the three tries.
    assert.ok(performance.now() - start >= 95);
  });
});
