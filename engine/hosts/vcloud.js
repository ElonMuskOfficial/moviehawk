/**
 * V-Cloud's file page (vcloud.beer/<id>), behind Vegamovies' and RogMovies' "V-Cloud [Resumable]"
 * buttons: HubCloud's software, branded VegaCloud. Its file card states the file's name and size
 * as HubCloud's does, and its download page lists the same servers (hubcloud.js); only the way to
 * that page differs: no button, but a script that holds its link, base64 of base64:
 * `var url = atob(atob('<...>'))`, "vcloud.beer/<id>?token=<...>" (live, 2026-11-03: 25 of 25
 * files of 2020 to 2026, and their download pages).
 */
import * as cheerio from 'cheerio';
import { EngineError } from '../errors.js';
import { fetchHtml } from '../http.js';
import { webUrlOf } from '../urls.js';
import { detailsOf, downloadsOf } from './hubcloud.js';

/** @typedef {import('./index.js').Download} Download */

const DOWNLOAD_LINK = /atob\(\s*atob\(\s*'([A-Za-z0-9+/=]+)'\s*\)\s*\)/;

/**
 * Reads a V-Cloud file page, then its download page; as resolveHubCloud.
 *
 * @param {string} url - On V-Cloud's current domain (older pages link vcloud.zip).
 * @param {import('../http.js').RequestOptions} [options]
 * @returns {Promise<{ filename: string, sizeBytes: number, downloads: Download[] }>}
 * @throws {EngineError} `unrecognized` for a file page without the file's name, a size it can read
 *   or the link to its download page, or a download page without servers; and fetchHtml's errors
 *   (`notFound`: a deleted file answers HTTP 404).
 */
export async function resolveVCloud(url, options) {
  // V-Cloud's Cloudflare answers a datacenter's request HTTP 403 without a Referer and this cookie
  // (live, 2026-11-03: Wasmer and Vercel's iad1 with them; none without, nor Vercel's bom1 with them).
  // V-Cloud's pages only: not its servers (10Gbps on HubCloud, Google).
  const pageOptions = { ...options, headers: { ...options?.headers, Referer: `${new URL(url).origin}/`, Cookie: 'xla=sod' } };
  const filePage = await fetchHtml(url, pageOptions);
  const $ = cheerio.load(filePage.html, { baseURI: filePage.url });
  const details = detailsOf($, url, 'V-Cloud');
  const encoded = DOWNLOAD_LINK.exec(filePage.html)?.[1];
  const decoded = encoded && Buffer.from(Buffer.from(encoded, 'base64').toString(), 'base64').toString();
  const downloadUrl = webUrlOf(decoded ?? '')?.href;
  if (!downloadUrl) throw new EngineError('unrecognized', 'No link to the download page on the V-Cloud file page', { url });
  return { ...details, downloads: await downloadsOf(await fetchHtml(downloadUrl, pageOptions), options, 'V-Cloud') };
}
