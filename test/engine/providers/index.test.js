import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { providerOf } from '../../../engine/providers/index.js';

describe('providerOf', () => {
  it('knows each provider by a label of the hostname, on any of its domains', () => {
    const cases = [
      ['https://new10.hdhub4u.cl/show-2026/', 'hdhub4u'],
      ['https://new9.hdhub4u.cl/show-2026/', 'hdhub4u'],
      ['https://4khdhub.one/show-series-1/', '4khdhub'],
    ];
    for (const [url, id] of cases) assert.equal(providerOf(url)?.id, id, url);
  });

  it('is null for any other site, and for text that is not a web URL', () => {
    for (const url of ['https://example.com/hdhub4u/', 'https://t.me/hdhub4u', 'hhttps://4khdhub.one/x-1/']) {
      assert.equal(providerOf(url), null, url);
    }
  });
});
