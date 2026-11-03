import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { gatewayOf } from '../../../engine/gateways/index.js';
import { expandGreenMotors } from '../../../engine/gateways/greenmotors.js';
import { expandHubDrive } from '../../../engine/gateways/hubdrive.js';
import { expandHubLinks } from '../../../engine/gateways/hublinks.js';
import { expandNexDrive } from '../../../engine/gateways/nexdrive.js';
import { expandVCloud } from '../../../engine/gateways/vcloud.js';

describe('gatewayOf', () => {
  it('knows each gateway page by its site and its path, as seen live', () => {
    const live = [
      ['https://greenmotors.club/?id=Q1dxTzFnbjhr', expandGreenMotors],
      ['https://greenmotors.cc/?id=Q1dxTzFnbjhr', expandGreenMotors],
      ['https://hblinks.lol/archives/104512', expandHubLinks],
      ['https://hblinks.pro/archives/88/', expandHubLinks],
      ['https://hubdrive.bar/file/2861517081', expandHubDrive],
      ['https://hubdrive.bar/packs/nqhtppaz', expandHubDrive],
      // 2026-11-03, behind Vegamovies' and RogMovies' buttons.
      ['https://nexdrive.beer/genxfm784776513232/', expandNexDrive],
      ['https://nexdrive.beer/genxfm7847761976/', expandNexDrive],
      ['https://vcloud.beer/api/index.php?link=NytUelVNMlB3STNm', expandVCloud],
    ];
    for (const [url, expand] of live) assert.equal(gatewayOf(url)?.expand, expand, url);
  });

  it('is null for the same sites\' other pages, and for anything else', () => {
    const others = [
      'https://hblinks.lol/', 'https://hblinks.lol/login', 'https://hubdrive.bar/newdl', 'https://greenmotors.cc/',
      'https://hubcloud.ist/drive/abc', 'https://t.me/hblinks', 'magnet:?xt=urn:btih:abc', 'not a url',
      // NexDrive's home, V-Cloud's files and its link page without a link.
      'https://nexdrive.beer/', 'https://vcloud.beer/uthhuboxjuitfuz', 'https://vcloud.beer/api/index.php',
    ];
    for (const url of others) assert.equal(gatewayOf(url), null, url);
  });
});
