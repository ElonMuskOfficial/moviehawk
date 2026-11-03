/**
 * HubCloud's file page (hubcloud.ist/drive/<id>, /video/<id>): the file's name and size, as the
 * page states them in its file card, and the link to its download page (gamerxyt.com/hubcloud.php),
 * which lists the file's servers. V-Cloud (vcloud.js) is the same software: its file card and
 * download page are read here too (detailsOf, downloadsOf).
 */
import * as cheerio from 'cheerio';
import { EngineError } from '../errors.js';
import { textOf } from '../html.js';
import { fetchHtml, followRedirects } from '../http.js';

/** @typedef {import('./index.js').Download} Download */

// HubCloud states sizes in binary units ("265.62 MB" is 278,522,757 bytes), KB (a subtitle, an
// image) to GB.
const UNITS = { KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3 };
const SIZE = /^(\d+(?:\.\d+)?)\s*(KB|MB|GB)$/;

// The download page's server buttons, by their text as HubCloud and V-Cloud write it (130
// HubCloud pages, 2026-10-31; 25 V-Cloud pages, 2026-11-03). `direct`: the button's link answers
// with the file itself (checked live for each, with a ranged GET); `page`: a page that leads to it.
// A button not listed here is server `other`, a page. 10Gbps's link is a page, which downloadOf
// follows to the file.
const SERVERS = [
  { server: '10gbps', kind: 'page', pattern: /^Download \[Server : 10Gbps\]$/ },
  { server: 'fsl', kind: 'direct', pattern: /^Download \[FSL Server\]$/ },
  { server: 'fslv2', kind: 'direct', pattern: /^Download \[FSLv2 Server\]$/ },
  { server: 'worker', kind: 'direct', pattern: /^Download File \[\d+(?:\.\d+)? (?:KB|MB|GB)\]$/ },
  { server: 'zipdisk', kind: 'direct', pattern: /^Download (?:Part \d+ )?\[ZipDisk Server\]$/ },
  // "[PixelServer : 2]", and "[PixelServer:2]" on a /video/ file's page (live, 2026-10-31).
  { server: 'pixeldrain', kind: 'page', pattern: /^Download \[PixelServer\s*:\s*\d+\]$/ },
  { server: 'buzz', kind: 'page', pattern: /^Download \[Buzz Server\]$/ },
  // V-Cloud's: the file's folder on GoFile (live, 2026-11-03).
  { server: 'gofile', kind: 'page', pattern: /^Download \[Gofile Server\]$/ },
  // V-Cloud writes "Downoad From Telegram 🔥" (live, 2026-11-03).
  { server: 'telegram', kind: 'page', pattern: /^Downl?oad From Telegram\b/ },
  { server: 'watch', kind: 'page', pattern: /^Watch Online$/ },
];

// 10Gbps's link redirects (gpdl.hubcloud.ist → a workers.dev) to an ad page whose `link`
// parameter is the file's URL: cryptonewz.online/dl.php?link=<file URL> (28 of 28 live, 2026-10-31).
const FILE_PARAM = 'link';

/**
 * Reads a HubCloud file page, then its download page, and returns every server button, in page
 * order. 10Gbps's link is followed to the file; when that fails, the button's own link is given,
 * as a page (in a browser it leads to the file, through the ad page).
 *
 * @param {string} url - On HubCloud's current domain (a URL kept from earlier can be on an older one: hubcloud.foo, ...).
 * @param {import('../http.js').RequestOptions} [options]
 * @returns {Promise<{ filename: string, sizeBytes: number, downloads: Download[] }>}
 * @throws {EngineError} `unrecognized` for a file page without the file's name, a size it can read
 *   or the link to its download page, or a download page without servers (a challenge page, a
 *   changed layout: every live page had one or more); and fetchHtml's errors (`notFound`: a
 *   deleted file answers HTTP 404, "404 ! File Not Found").
 */
export async function resolveHubCloud(url, options) {
  const filePage = await fetchHtml(url, options);
  const $file = cheerio.load(filePage.html, { baseURI: filePage.url });
  const details = detailsOf($file, url, 'HubCloud');
  // The link to the download page is the file card's one primary button: `#download` on a
  // /drive/ page, without the id on a /video/ page (live, 2026-10-31: 40 of 40 and 8 of 8).
  const downloadUrl = $file('a.btn-primary[href]').first().prop('href');
  if (!downloadUrl) throw new EngineError('unrecognized', 'No link to the download page on the HubCloud file page', { url });
  return { ...details, downloads: await downloadsOf(downloadUrl, options, 'HubCloud') };
}

/**
 * The file's name and size, from the file card of a HubCloud or V-Cloud page.
 *
 * @param {import('cheerio').CheerioAPI} $
 * @param {string} url - The page, for the error.
 * @param {string} host - Its name, for the error: "HubCloud".
 * @returns {{ filename: string, sizeBytes: number }}
 * @throws {EngineError} `unrecognized` for a page without the file's name or a size it can read.
 */
export function detailsOf($, url, host) {
  const filename = $('.card-header').first().text().trim();
  const [, amount, unit] = SIZE.exec($('#size').first().text().trim()) ?? [];
  if (!filename || !unit) throw new EngineError('unrecognized', `No file name or size on the ${host} file page`, { url });
  return { filename, sizeBytes: Math.round(Number(amount) * UNITS[unit]) };
}

/**
 * Reads a HubCloud or V-Cloud download page: every server button, in page order, each by its link
 * as the page's script leaves it. The page writes a decoy into a button and sets the real link
 * from its script: PixelServer's `href` is "pixeldrain.dev/u/negn6f" on every page, a file that
 * is not there, and `var pxl = "<the file's>"; document.getElementById("pxl-1").href = pxl;`
 * replaces it (live, 2026-11-03: HubCloud and V-Cloud alike). A button without a link
 * (V-Cloud's "Download [Server : 1]", `href=""`) leads nowhere, and is left out.
 *
 * @param {string} url - The download page.
 * @param {import('../http.js').RequestOptions} [options]
 * @param {string} host - Its name, for the error: "HubCloud".
 * @returns {Promise<Download[]>}
 * @throws {EngineError} `unrecognized` for a page without servers; and fetchHtml's errors.
 */
export async function downloadsOf(url, options, host) {
  const page = await fetchHtml(url, options);
  const $ = cheerio.load(page.html, { baseURI: page.url });
  const scripted = scriptedHrefsOf($);
  // The page's other links (VPN, a tutorial, the site's new domain) sit in the same headings,
  // but are not buttons.
  const buttons = $('.card-body h2 a.btn[href]').toArray()
    .filter((a) => $(a).attr('href').trim())
    .map((a) => ({ label: textOf($(a)), url: scripted.get($(a).attr('id')) ?? $(a).prop('href') }));
  if (buttons.length === 0) throw new EngineError('unrecognized', `No servers on the ${host} download page`, { url });
  return Promise.all(buttons.map((button) => downloadOf(button, options)));
}

/**
 * The links the page's script puts in its buttons, by the button's id: `var pxl = "<URL>";` then
 * `document.getElementById("pxl-1").href = pxl;`.
 *
 * @returns {Map<string, string>}
 */
function scriptedHrefsOf($) {
  const script = $('script').toArray().map((element) => $(element).text()).join('\n');
  const values = new Map([...script.matchAll(/\bvar\s+(\w+)\s*=\s*"(https?:\/\/[^"]+)"/g)].map(([, name, value]) => [name, value]));
  const hrefs = new Map();
  for (const [, id, name] of script.matchAll(/getElementById\(\s*["']([^"']+)["']\s*\)\.href\s*=\s*(\w+)\s*;/g)) {
    if (values.has(name)) hrefs.set(id, values.get(name));
  }
  return hrefs;
}

/** @returns {Promise<Download>} */
async function downloadOf({ label, url }, options) {
  const { server, kind } = SERVERS.find((entry) => entry.pattern.test(label)) ?? { server: 'other', kind: 'page' };
  if (server !== '10gbps') return { server, kind, url, label };
  try {
    const fileUrl = new URL(await followRedirects(url, options)).searchParams.get(FILE_PARAM);
    if (fileUrl) return { server, kind: 'direct', url: fileUrl, label };
  } catch (error) {
    // The redirects stalled, or ended on a 404 (one zip's, live): the button stays as it is.
    if (!(error instanceof EngineError)) throw error;
  }
  return { server, kind, url, label };
}
