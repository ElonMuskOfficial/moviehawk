import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { answer, greenMotorsPage } from '../helpers.js';
import { expandGreenMotors } from '../../../src/engine/gateways/greenmotors.js';

const URL_GM = 'https://greenmotors.cc/?id=abc';
// A live page (2026-10-31), from a button of 4KHDHub's "The Furious".
const LIVE_PAGE = readFileSync(new URL('../../fixtures/greenmotors-page.html', import.meta.url), 'utf8');


describe('expandGreenMotors', () => {
  it('decodes the destination of a live page', async () => {
    assert.deepEqual(await expandGreenMotors(URL_GM, answer(LIVE_PAGE)), { links: [{ url: 'https://hubcloud.ist/drive/nank1rqnnhdohh0', label: null }] });
  });

  it('returns a destination that is another GreenMotors link as it is', async () => {
    const page = greenMotorsPage({ o: Buffer.from('https://greenmotors.cc/?id=next').toString('base64') });
    assert.deepEqual(await expandGreenMotors(URL_GM, answer(page)), { links: [{ url: 'https://greenmotors.cc/?id=next', label: null }] });
  });

  it('is notFound when GreenMotors says the link is dead', async () => {
    for (const body of ['Invalid Link !!', '\n Failed to decode link \n']) {
      await assert.rejects(expandGreenMotors(URL_GM, answer(body)), { code: 'notFound', url: URL_GM });
    }
  });

  it("gives a destination that is no web URL (a magnet) as it is: which to follow is the caller's", async () => {
    const page = greenMotorsPage({ o: Buffer.from('magnet:?xt=urn:btih:abc').toString('base64') });
    assert.deepEqual(await expandGreenMotors(URL_GM, answer(page)), { links: [{ url: 'magnet:?xt=urn:btih:abc', label: null }] });
  });

  it('is unrecognized for a page without a destination', async () => {
    const pages = [
      '<html><title>greenmountmotors.com</title><body>Cars for sale</body></html>', // its home page
      "<script>s('o','not base64 json');</script>",
      greenMotorsPage({ w: 10 }), // a token without a destination
      greenMotorsPage({ o: Buffer.from('not a url').toString('base64') }), // a destination that is no URL
      '<p>Invalid Link !! Try another</p>', // the marker inside a real page is not the dead-link answer
    ];
    for (const page of pages) {
      await assert.rejects(expandGreenMotors(URL_GM, answer(page)), { code: 'unrecognized', url: URL_GM });
    }
  });

  it('passes fetching errors on as they are', async () => {
    await assert.rejects(expandGreenMotors(URL_GM, answer('', { status: 404 })), { code: 'notFound' });
    await assert.rejects(expandGreenMotors(URL_GM, answer('', { status: 503 })), { code: 'transient' });
  });
});
