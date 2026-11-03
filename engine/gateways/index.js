/**
 * The gateways the engine follows: pages that lead further, to hosts or to other gateways. A
 * gateway is matched by a label of the URL's hostname (urls.js) and by the shape of its path: the
 * same sites also have pages that are no gateway (HUBLinks' home and login, "hubdrive.bar/newdl").
 */
import { hasLabel, webUrlOf } from '../urls.js';
import { expandGreenMotors } from './greenmotors.js';
import { expandHubDrive } from './hubdrive.js';
import { expandHubLinks } from './hublinks.js';
import { expandNexDrive } from './nexdrive.js';
import { expandVCloud } from './vcloud.js';

// Each gateway's id is also the hostname label that identifies it. Shapes seen on live posts
// (2026-10-31): greenmotors.club/?id=<token>, hblinks.lol/archives/<n>, hubdrive.bar/file/<id>,
// hubdrive.bar/packs/<id>.
const GATEWAYS = [
  { id: 'greenmotors', matches: (url) => url.pathname === '/' && url.searchParams.has('id'), expand: expandGreenMotors },
  { id: 'hblinks', matches: (url) => /^\/archives\/\d+\/?$/.test(url.pathname), expand: expandHubLinks },
  { id: 'hubdrive', matches: (url) => /^\/(?:file|packs)\/[\w-]+\/?$/.test(url.pathname), expand: expandHubDrive },
  // Vegamovies' and RogMovies' (live, 2026-11-03): nexdrive.beer/genxfm<n>/, every one of 590
  // buttons; V-Cloud's older link page, vcloud.beer/api/index.php?link=<...>, whose files are V-Cloud's
  // own (hosts/index.js).
  { id: 'nexdrive', matches: (url) => /^\/genxfm\d+\/?$/.test(url.pathname), expand: expandNexDrive },
  { id: 'vcloud', matches: (url) => url.pathname === '/api/index.php' && url.searchParams.has('link'), expand: expandVCloud },
];

/**
 * The gateway a URL is a page of: "https://hblinks.lol/archives/123" → HUBLinks, whose `expand`
 * reads the page.
 *
 * @param {string} url
 * @returns {typeof GATEWAYS[number] | null} null when the URL is no gateway page the engine knows.
 */
export function gatewayOf(url) {
  const parsed = webUrlOf(url);
  return (parsed && GATEWAYS.find(({ id, matches }) => hasLabel(parsed, id) && matches(parsed))) ?? null;
}
