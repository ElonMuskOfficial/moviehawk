/**
 * HubCloud's file page (hubcloud.ist/drive/<id>, /video/<id>): the file's name and size, as the
 * page states them in its file card.
 */
import * as cheerio from 'cheerio';
import { EngineError } from '../errors.js';
import { fetchHtml } from '../http.js';

// HubCloud states sizes in binary units ("265.62 MB" is 278,522,757 bytes). The 206,598 files
// stored by 2026-10-31 are 2 MB to 278 GB; a subtitle or an image is in KB.
const UNITS = { KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3 };
const SIZE = /^(\d+(?:\.\d+)?)\s*(KB|MB|GB)$/;

/**
 * Reads a HubCloud file page. A deleted file answers HTTP 404 ("404 ! File Not Found"), which
 * fetchHtml makes `notFound`.
 *
 * @param {string} url - On HubCloud's current domain (stored files keep older ones: hubcloud.foo, ...).
 * @param {Parameters<typeof fetchHtml>[1]} [options]
 * @returns {Promise<{ filename: string, sizeBytes: number }>}
 * @throws {EngineError} `unrecognized` for a page without the file's name or a size it can read (a
 *   challenge page, a changed layout), and fetchHtml's errors.
 */
export async function scrapeHubCloud(url, options) {
  const { html } = await fetchHtml(url, options);
  const $ = cheerio.load(html);
  const filename = $('.card-header').first().text().trim();
  const [, amount, unit] = SIZE.exec($('#size').first().text().trim()) ?? [];
  if (!filename || !unit) throw new EngineError('unrecognized', 'No file name or size on the HubCloud page', { url });
  return { filename, sizeBytes: Math.round(Number(amount) * UNITS[unit]) };
}
