import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { externalIdOf, hostOf } from '../../../src/engine/hosts/index.js';

// Real URLs from live posts (2026-10-31).
const LIVE = [
  ['https://hubcloud.ist/drive/1z0cw0xpymizwio', 'hubcloud', '1z0cw0xpymizwio'],
  ['https://hubcloud.ist/drive/--3gp--l-11g0et', 'hubcloud', '--3gp--l-11g0et'],
  ['https://hubcloud.ist/video/0f9100t1nvzvvyc', 'hubcloud', '0f9100t1nvzvvyc'],
  ['https://hubcloud.foo/drive/169wy9tkx7bbky7', 'hubcloud', '169wy9tkx7bbky7'],
  ['https://hubcdn.club/file/ALM7MJGBLnosjv5Fx6gttxDrr', 'hubcdn', 'ALM7MJGBLnosjv5Fx6gttxDrr'],
  ['https://hubcdn.wiki/file/7kbCWntPMvf4Gej61qnkQnmgS', 'hubcdn', '7kbCWntPMvf4Gej61qnkQnmgS'],
  ['https://gofile.io/d/U551pXPn', 'gofile', 'U551pXPn'],
  ['https://hdstream4u.com/file/pmmjzrfsn4c9', 'hdstream4u', 'pmmjzrfsn4c9'],
  ['https://hubstream.art/#3ywqve', 'hubstream', '3ywqve'],
  ['https://new3.multicloudlinks.com/view/sh6ob8', 'multicloudlinks', 'sh6ob8'],
  ['https://new.multicloudlinks.com/player.php/?v=ncp0ta', 'multicloudlinks', 'ncp0ta'],
];

describe('hostOf and externalIdOf', () => {
  it('read the host and the file id of every URL shape seen live', () => {
    for (const [url, host, id] of LIVE) {
      assert.equal(hostOf(url), host, url);
      assert.equal(externalIdOf(url), id, url);
    }
  });

  it('give one file the same id on every domain and scheme of its host', () => {
    const ids = ['https://hubcloud.ist/drive/abc', 'http://hubcloud.fit/drive/abc/', 'https://dl.HubCloud.link/drive/abc'].map(externalIdOf);
    assert.deepEqual(ids, ['abc', 'abc', 'abc']);
  });

  it('read GoFile\'s older "?c=<id>" links', () => {
    assert.equal(externalIdOf('https://gofile.io/?c=Ab12'), 'Ab12');
  });

  it('match the hostname, not a substring of the URL', () => {
    for (const url of ['https://t.me/hubcloudreport', 'https://example.com/?ref=hubdrive', 'https://example.com/hubcloud/drive/abc', 'https://myhubcloud.com/drive/abc']) {
      assert.equal(hostOf(url), null, url);
    }
  });

  it('know no host for a link that is not a web URL', () => {
    for (const url of ['hhttps://hubcloud.ist/drive/abc', 'magnet:?xt=urn:btih:hubcloud', 'hubcloud drive abc', '', undefined]) {
      assert.equal(hostOf(url), null, String(url));
      assert.equal(externalIdOf(url), null, String(url));
    }
  });

  it('find no file in a host URL that names none', () => {
    const noFile = [
      'https://hubcloud.ist/drive/search-recover.php?from_ac=fz7D8vXBV5qe&q=VGhlIFRvd24',
      'https://hubcloud.ist/',
      'https://hubcloud.ist/drive/abc/extra',
      'https://hubcdn.wiki/embed',
      'https://hubstream.art/',
      'https://gofile.io/d/',
      'https://new.multicloudlinks.com/player.php/',
    ];
    for (const url of noFile) {
      assert.notEqual(hostOf(url), null, url);
      assert.equal(externalIdOf(url), null, url);
    }
  });
});
