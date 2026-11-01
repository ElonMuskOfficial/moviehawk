import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hasLabel, onCurrentDomain, webUrlOf } from '../../src/engine/urls.js';

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

describe('onCurrentDomain', () => {
  const domains = { hblinks: 'https://hblinks.lol', hubcloud: 'https://hubcloud.ist' };

  it('moves a URL to the current domain of its site, keeping its path', () => {
    assert.equal(onCurrentDomain(new URL('https://hblinks.pro/archives/1'), domains), 'https://hblinks.lol/archives/1');
    assert.equal(onCurrentDomain(new URL('http://dl.hubcloud.link/drive/a?x=1'), domains), 'https://hubcloud.ist/drive/a?x=1');
  });

  it('keeps nothing of the old origin: not its port, not its credentials', () => {
    assert.equal(onCurrentDomain(new URL('http://user:pass@hubcloud.127.0.0.1.nip.io:8080/drive/a#x'), domains), 'https://hubcloud.ist/drive/a#x');
  });

  it('leaves a URL of any other site as it is', () => {
    assert.equal(onCurrentDomain(new URL('https://hubcdn.club/file/a'), domains), 'https://hubcdn.club/file/a');
  });
});
