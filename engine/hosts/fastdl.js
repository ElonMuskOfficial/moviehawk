/**
 * FastDL's file page (fastdl.beer/embed?download=<id>, or /embed.php?download=<id>), behind
 * Vegamovies' and RogMovies' "G-Direct [Instant]" buttons: HubCDN's software. A "redirecting ..."
 * page whose script holds the file's download link, as it is:
 * `var reurl = "https://fastdl.beer/dl.php?link=<the file's URL>"`. The file's URL is on Google
 * (live, 2026-11-03: 25 of 25 files of 2020 to 2026); its name and size are in its headers, asked
 * for with a HEAD request (hubcdn.js).
 */
import { EngineError } from '../errors.js';
import { fetchHtml } from '../http.js';
import { webUrlOf } from '../urls.js';
import { DELETED, detailsFromHeaders } from './hubcdn.js';

/** @typedef {import('./index.js').Download} Download */

const REDIRECT = /\breurl\s*=\s*"([^"]+)"/;
// The download link's parameter that is the file's URL: fastdl.beer/dl.php?link=<file URL>.
const FILE_PARAM = 'link';

/**
 * Reads a FastDL file page, and the headers of the file's URL. The file has one download, direct.
 *
 * @param {string} url - On FastDL's current domain.
 * @param {import('../http.js').RequestOptions} [options]
 * @returns {Promise<{ filename: string | null, sizeBytes: number | null, downloads: Download[] }>}
 *   `filename`, `sizeBytes`: from the file's headers; null when the HEAD request fails or a header
 *   is missing, as the download still works.
 * @throws {EngineError} `notFound` for FastDL's deleted page ("File is Deleted or UnAvailable....",
 *   HTTP 200, as HubCDN's); `unrecognized` for a page without the download link; and fetchHtml's
 *   errors.
 */
export async function resolveFastDl(url, options) {
  const page = await fetchHtml(url, options);
  const link = webUrlOf(REDIRECT.exec(page.html)?.[1] ?? '');
  if (!link) {
    if (DELETED.test(page.html)) throw new EngineError('notFound', 'FastDL says the file is deleted or unavailable', { url });
    throw new EngineError('unrecognized', 'No download link on the FastDL file page', { url });
  }
  const fileUrl = webUrlOf(link.searchParams.get(FILE_PARAM) ?? '')?.href;
  if (!fileUrl) throw new EngineError('unrecognized', 'No file URL in the FastDL download link', { url });

  return {
    ...(await detailsFromHeaders(fileUrl, options)),
    downloads: [{ server: 'fastdl', kind: 'direct', url: fileUrl, label: 'Download [FastDL]' }],
  };
}
