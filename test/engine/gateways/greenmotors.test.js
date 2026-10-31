import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { expandGreenMotors } from '../../../src/engine/gateways/greenmotors.js';

const URL_GM = 'https://greenmotors.cc/?id=abc';
// A live page (2026-10-31), from a button of 4KHDHub's "The Furious".
const LIVE_PAGE = readFileSync(new URL('../../fixtures/greenmotors-page.html', import.meta.url), 'utf8');

const answer = (body, status = 200) => ({ fetch: async () => new Response(body, { status }) });

// A page with the token GreenMotors' script stores, for a given JSON object.
const pageWith = (config) => {
  const rot13 = (text) => text.replace(/[a-z]/gi, (c) => {
    const a = c <= 'Z' ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - a + 13) % 26) + a);
  });
  const b64 = (text) => Buffer.from(text).toString('base64');
  return `<script>s('o','${b64(b64(rot13(b64(JSON.stringify(config)))))}',180*1000);</script>`;
};

describe('expandGreenMotors', () => {
  it('decodes the destination of a live page', async () => {
    assert.deepEqual(await expandGreenMotors(URL_GM, answer(LIVE_PAGE)), { links: [{ url: 'https://hubcloud.ist/drive/nank1rqnnhdohh0', label: null }] });
  });

  it('returns a destination that is another GreenMotors link as it is', async () => {
    const page = pageWith({ o: Buffer.from('https://greenmotors.cc/?id=next').toString('base64') });
    assert.deepEqual(await expandGreenMotors(URL_GM, answer(page)), { links: [{ url: 'https://greenmotors.cc/?id=next', label: null }] });
  });

  it('is notFound when GreenMotors says the link is dead', async () => {
    for (const body of ['Invalid Link !!', '\n Failed to decode link \n']) {
      await assert.rejects(expandGreenMotors(URL_GM, answer(body)), { code: 'notFound', url: URL_GM });
    }
  });

  it('is unrecognized for a page without a destination', async () => {
    const pages = [
      '<html><title>greenmountmotors.com</title><body>Cars for sale</body></html>', // its home page
      "<script>s('o','not base64 json');</script>",
      pageWith({ w: 10 }), // a token without a destination
      '<p>Invalid Link !! Try another</p>', // the marker inside a real page is not the dead-link answer
    ];
    for (const page of pages) {
      await assert.rejects(expandGreenMotors(URL_GM, answer(page)), { code: 'unrecognized', url: URL_GM });
    }
  });

  it('passes fetching errors on as they are', async () => {
    await assert.rejects(expandGreenMotors(URL_GM, answer('', 404)), { code: 'notFound', status: 404 });
    await assert.rejects(expandGreenMotors(URL_GM, answer('', 503)), { code: 'transient', status: 503 });
  });
});
