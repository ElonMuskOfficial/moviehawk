import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { externalIdOf, hostOf } from '../../../engine/hosts/index.js';

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
  ['https://vidaraa.cc/e/WFwz7q5riBgD', 'vidaraa', 'WFwz7q5riBgD'],
  // 2026-11-01, behind a GreenMotors link.
  ['https://strtape.tech/v/7PB7rmZQw1tJ8L/The.Great.Indian.Kapil.Show.S05E06.1080p.Hindi.WEB-DL.5.1.ESub.x264-HDHub4u.Ag', 'streamtape', '7PB7rmZQw1tJ8L'],
  ['https://play4u.org/series/tt29625288/s-01/ep-01', 'play4u', 'tt29625288/s-01/ep-01'],
  ['https://play4u.org/series/tt29625288/s-01/', 'play4u', 'tt29625288/s-01'],
  ['https://new3.multicloudlinks.com/view/sh6ob8', 'multicloudlinks', 'sh6ob8'],
  ['https://new.multicloudlinks.com/player.php/?v=ncp0ta', 'multicloudlinks', 'ncp0ta'],
  // 2026-11-03, behind NexDrive's pages.
  ['https://vcloud.beer/uthhuboxjuitfuz', 'vcloud', 'uthhuboxjuitfuz'],
  ['https://vcloud.zip/gheyw_bhhk1y1zj', 'vcloud', 'gheyw_bhhk1y1zj'],
  ['https://fastdl.beer/embed?download=3fYRoUWkPzx9aRumlzniXEjG0', 'fastdl', '3fYRoUWkPzx9aRumlzniXEjG0'],
  ['https://fastdl.beer/embed.php?download=qc1yQwPih2N6nukpUb7dz0rOw', 'fastdl', 'qc1yQwPih2N6nukpUb7dz0rOw'],
  ['https://fastdl.beer//embed?download=Abc123', 'fastdl', 'Abc123'],
  ['https://one.vegadrive.app/s/M3danEMD6gKon9hbQ5s9ElbFkehQcGpENgrB78Mb5MkMadfv', 'vegadrive', 'M3danEMD6gKon9hbQ5s9ElbFkehQcGpENgrB78Mb5MkMadfv'],
  ['https://one.vegadrive.me/s/2WdhhFFQ9qvp', 'vegadrive', '2WdhhFFQ9qvp'],
];

describe('hostOf and externalIdOf', () => {
  it('read the host and the file id of every URL shape seen live', () => {
    for (const [url, host, id] of LIVE) {
      assert.equal(hostOf(url)?.id, host, url);
      assert.equal(externalIdOf(url), id, url);
    }
  });

  it('give one file the same id on every domain and scheme of its host', () => {
    const ids = ['https://hubcloud.ist/drive/abc', 'http://hubcloud.fit/drive/abc/', 'https://dl.HubCloud.link/drive/abc'].map(externalIdOf);
    assert.deepEqual(ids, ['abc', 'abc', 'abc']);
  });

  it('give a Streamtape file one id on its page and its player, on each of its names', () => {
    const urls = ['https://strtape.tech/v/7PB7rmZQw1tJ8L/a.mkv', 'https://stape.fun/v/7PB7rmZQw1tJ8L/a.mkv', 'https://streamtape.com/v/7PB7rmZQw1tJ8L', 'https://streamtape.com/e/7PB7rmZQw1tJ8L/'];
    assert.deepEqual(urls.map((url) => [hostOf(url)?.id, externalIdOf(url)]), urls.map(() => ['streamtape', '7PB7rmZQw1tJ8L']));
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
      'https://play4u.org/',
      'https://strtape.tech/',
      'https://streamtape.com/v/abc/name/extra',
      // V-Cloud's home and a download page's path; FastDL's page without a file; VegaDrive's
      // mirror link; the older vegadrive.xyz's "/<id>", another site's, gone.
      'https://vcloud.beer/', 'https://vcloud.beer/a/b', 'https://fastdl.beer/embed.php', 'https://fastdl.beer/dl.php?download=a',
      'https://one.vegadrive.me/d/2WdhhFFQ9qvp/telegram', 'https://vegadrive.xyz/cd37pw4k90xh',
    ];
    for (const url of noFile) {
      assert.notEqual(hostOf(url), null, url);
      assert.equal(externalIdOf(url), null, url);
    }
  });
});
