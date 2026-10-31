import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hasLabel, webUrlOf } from '../../src/engine/urls.js';

describe('webUrlOf', () => {
  it('parses http and https URLs only', () => {
    assert.equal(webUrlOf('https://hubcloud.ist/drive/abc')?.hostname, 'hubcloud.ist');
    assert.equal(webUrlOf('http://hubcloud.foo/drive/abc')?.hostname, 'hubcloud.foo');
    for (const text of ['hhttps://hubcloud.ist/drive/abc', 'magnet:?xt=urn:btih:abc', 'javascript:void(0)', 'Drive', '']) {
      assert.equal(webUrlOf(text), null, text);
    }
  });
});

describe('hasLabel', () => {
  it('matches a whole label of the hostname, never a part of the URL', () => {
    assert.equal(hasLabel(new URL('https://dl.HubCloud.link/drive/abc'), 'hubcloud'), true);
    assert.equal(hasLabel(new URL('https://t.me/hubcloudreport'), 'hubcloud'), false);
    assert.equal(hasLabel(new URL('https://myhubcloud.ist/'), 'hubcloud'), false);
  });
});
