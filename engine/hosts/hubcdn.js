/**
 * HubCDN's file page (hubcdn.club/file/<id>, which redirects to hubcdn.wiki): a "redirecting ..."
 * page whose script holds the file's download link, base64-encoded:
 * reurl = "https://inventoryidea.com/?r=<base64 of hubcdn.club/dl/?link=<the file's URL>>".
 * The file's URL is on R2 or Google (live, 2026-11-01); its name and size are in that URL's
 * headers, asked for with a HEAD request, which sends none of the file.
 */
import { EngineError } from '../errors.js';
import { fetchHead, fetchHtml } from '../http.js';
import { webUrlOf } from '../urls.js';

/** @typedef {import('./index.js').Download} Download */

// The redirect's base64 parameter: "?r=aHR0cHM6Ly9odWJjZG4uY2x1Yi9kbC8/bGluaz1..." (the script
// writes it twice, the second time in its obfuscated part).
const TOKEN = /[?&]r=([A-Za-z0-9+/]{20,}={0,2})/;
// The download link's parameter that is the file's URL: hubcdn.club/dl/?link=<file URL>.
const FILE_PARAM = 'link';
// HubCDN answers a deleted file with HTTP 200 and this page: "No URL found.Failed to get data from
// gserver", then "File is Deleted or UnAvailable....Re.Trying to Reload Page" (live, 2026-10-28
// and 2026-11-01, unchanged for hours and in a browser).
export const DELETED = /File is Deleted or UnAvailable/i;

/**
 * Reads a HubCDN file page, and the headers of the file's URL. The file has one download, direct.
 *
 * @param {string} url - On HubCDN's current domain.
 * @param {import('../http.js').RequestOptions} [options]
 * @returns {Promise<{ filename: string | null, sizeBytes: number | null, downloads: Download[] }>}
 *   `filename`, `sizeBytes`: from the file's headers; null when the HEAD request fails or a header
 *   is missing, as the download still works.
 * @throws {EngineError} `notFound` for HubCDN's deleted page; `unrecognized` for a page without the
 *   download link (a challenge page, a changed layout); and fetchHtml's errors (`notFound`: HTTP 404).
 */
export async function resolveHubCdn(url, options) {
  const page = await fetchHtml(url, options);
  const token = TOKEN.exec(page.html)?.[1];
  if (!token) {
    if (DELETED.test(page.html)) throw new EngineError('notFound', 'HubCDN says the file is deleted or unavailable', { url });
    throw new EngineError('unrecognized', 'No download link on the HubCDN file page', { url });
  }
  const link = webUrlOf(Buffer.from(token, 'base64').toString());
  const fileUrl = webUrlOf(link?.searchParams.get(FILE_PARAM) ?? '')?.href;
  if (!fileUrl) throw new EngineError('unrecognized', 'No file URL in the HubCDN download link', { url });

  return {
    ...(await detailsFromHeaders(fileUrl, options)),
    downloads: [{ server: 'hubcdn', kind: 'direct', url: fileUrl, label: 'Download [HubCDN]' }],
  };
}

/**
 * The file's name and size, from its URL's headers (FastDL's files too, fastdl.js).
 *
 * @param {string} fileUrl
 * @param {import('../http.js').RequestOptions} [options]
 * @returns {Promise<{ filename: string | null, sizeBytes: number | null }>} null for what the
 *   headers do not state, or for both when the HEAD request fails.
 */
export async function detailsFromHeaders(fileUrl, options) {
  let headers;
  try {
    ({ headers } = await fetchHead(fileUrl, options));
  } catch (error) {
    // The storage did not answer, or refused a HEAD: the file has no name or size, its download stays.
    if (!(error instanceof EngineError)) throw error;
    return { filename: null, sizeBytes: null };
  }
  const length = Number(headers.get('content-length'));
  return {
    filename: filenameOf(headers.get('content-disposition')),
    sizeBytes: Number.isSafeInteger(length) && length > 0 ? length : null,
  };
}

/**
 * The file name a Content-Disposition header states (RFC 6266): R2 writes
 * `attachment; filename*=UTF-8''<percent-encoded>`, Google `attachment; filename="<name>"`.
 *
 * @param {string | null} header
 * @returns {string | null}
 */
export function filenameOf(header) {
  if (!header) return null;
  const encoded = /filename\*\s*=\s*[\w-]*'[\w-]*'([^;]+)/i.exec(header)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded.trim()) || null;
    } catch {
      // A malformed encoding: the plain filename, if any.
    }
  }
  const plain = /filename\s*=\s*(?:"([^"]*)"|([^;]+))/i.exec(header);
  return (plain?.[1] ?? plain?.[2])?.trim() || null;
}
