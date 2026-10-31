/**
 * HubCloud's file page (hubcloud.ist/drive/<id>, /video/<id>): the file's name and size, as the
 * page states them in its file card; and its download page (gamerxyt.com/hubcloud.php), which
 * lists the file's servers.
 */
import * as cheerio from 'cheerio';
import { EngineError } from '../errors.js';
import { fetchHtml, followRedirects } from '../http.js';

/** @typedef {import('./index.js').Download} Download */

// HubCloud states sizes in binary units ("265.62 MB" is 278,522,757 bytes). The 206,598 files
// stored by 2026-10-31 are 2 MB to 278 GB; a subtitle or an image is in KB.
const UNITS = { KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3 };
const SIZE = /^(\d+(?:\.\d+)?)\s*(KB|MB|GB)$/;

// The download page's server buttons, by their text as HubCloud writes it (130 pages, 2026-10-31).
// `direct`: the button's link answers with the file itself (checked live for each, with a ranged
// GET); `page`: a page that leads to it. A button not listed here is server `other`, a page.
// 10Gbps's link is a page, which downloadOf follows to the file.
const SERVERS = [
  { server: '10gbps', kind: 'page', pattern: /^Download \[Server : 10Gbps\]$/ },
  { server: 'fsl', kind: 'direct', pattern: /^Download \[FSL Server\]$/ },
  { server: 'fslv2', kind: 'direct', pattern: /^Download \[FSLv2 Server\]$/ },
  { server: 'worker', kind: 'direct', pattern: /^Download File \[\d+(?:\.\d+)? (?:KB|MB|GB)\]$/ },
  { server: 'zipdisk', kind: 'direct', pattern: /^Download (?:Part \d+ )?\[ZipDisk Server\]$/ },
  { server: 'pixeldrain', kind: 'page', pattern: /^Download \[PixelServer : \d+\]$/ },
  { server: 'buzz', kind: 'page', pattern: /^Download \[Buzz Server\]$/ },
  { server: 'telegram', kind: 'page', pattern: /^Download From Telegram$/ },
  { server: 'watch', kind: 'page', pattern: /^Watch Online$/ },
];

// 10Gbps's link redirects (gpdl.hubcloud.ist → a workers.dev) to an ad page whose `link`
// parameter is the file's URL: cryptonewz.online/dl.php?link=<file URL> (28 of 28 live, 2026-10-31).
const FILE_PARAM = 'link';

/**
 * Reads a HubCloud file page. A deleted file answers HTTP 404 ("404 ! File Not Found"), which
 * fetchHtml makes `notFound`.
 *
 * @param {string} url - On HubCloud's current domain (stored files keep older ones: hubcloud.foo, ...).
 * @param {import('../http.js').RequestOptions} [options]
 * @returns {Promise<{ filename: string, sizeBytes: number }>}
 * @throws {EngineError} `unrecognized` for a page without the file's name or a size it can read (a
 *   challenge page, a changed layout), and fetchHtml's errors.
 */
export async function scrapeHubCloud(url, options) {
  const { html } = await fetchHtml(url, options);
  return detailsOf(cheerio.load(html), url);
}

/**
 * Reads a HubCloud file page, then its download page, and returns every server button, in page
 * order. 10Gbps's link is followed to the file; when that fails, the button's own link is given,
 * as a page (in a browser it leads to the file, through the ad page).
 *
 * @param {string} url - As for scrapeHubCloud.
 * @param {import('../http.js').RequestOptions} [options]
 * @returns {Promise<{ filename: string, sizeBytes: number, downloads: Download[] }>}
 * @throws {EngineError} scrapeHubCloud's errors; `unrecognized` for a file page without the link
 *   to its download page, or a download page without servers (a challenge page: every live page
 *   had one or more); and fetchHtml's errors for the download page.
 */
export async function resolveHubCloud(url, options) {
  const filePage = await fetchHtml(url, options);
  const $file = cheerio.load(filePage.html, { baseURI: filePage.url });
  const details = detailsOf($file, url);
  const downloadUrl = $file('#download').prop('href');
  if (!downloadUrl) throw new EngineError('unrecognized', 'No link to the download page on the HubCloud page', { url });

  const downloadPage = await fetchHtml(downloadUrl, options);
  const $ = cheerio.load(downloadPage.html, { baseURI: downloadPage.url });
  // The page's other links (VPN, a tutorial, the site's new domain) sit in the same headings,
  // but are not buttons.
  const buttons = $('.card-body h2 a.btn[href]').toArray()
    .map((a) => ({ label: $(a).text().replace(/\s+/g, ' ').trim(), url: $(a).prop('href') }));
  if (buttons.length === 0) {
    throw new EngineError('unrecognized', 'No servers on the HubCloud download page', { url: downloadUrl });
  }
  return { ...details, downloads: await Promise.all(buttons.map((button) => downloadOf(button, options))) };
}

/** @returns {{ filename: string, sizeBytes: number }} */
function detailsOf($, url) {
  const filename = $('.card-header').first().text().trim();
  const [, amount, unit] = SIZE.exec($('#size').first().text().trim()) ?? [];
  if (!filename || !unit) throw new EngineError('unrecognized', 'No file name or size on the HubCloud page', { url });
  return { filename, sizeBytes: Math.round(Number(amount) * UNITS[unit]) };
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
