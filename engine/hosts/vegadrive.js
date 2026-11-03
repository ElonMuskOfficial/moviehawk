/**
 * VegaDrive's file page (one.vegadrive.me/s/<id>; posts link one.vegadrive.app, which redirects
 * there), behind Vegamovies' and RogMovies' "V-Drive [Multi]" buttons: the file's name and size,
 * its "Vegadrop (10Gbps Direct)" button, and its mirrors (Telegram, GoFile, Buzzheavier, ...), each
 * a link "/d/<id>/<mirror>" that leads there in a browser (live, 2026-11-03: 25 of 25 files; a zip
 * has no Vegadrop, only mirrors).
 *
 * Vegadrop is followed to the file, as its page's script does it, in one session (its cookies):
 * its page ("/d/<id>/skydrop") asks "prepare" until the link is ready, then "download-link" for
 * it: `{ download_url }`, a file on Google (live, 2026-11-03: 16 of 16, in 4 to 14 s). Without the
 * session, both lead back to the file page. The answer says `expires_in_seconds: 120`, but that is
 * how long the page keeps its button ready: the file's URL still answered 20 minutes on (live,
 * 2026-11-03), so it is a download as any other.
 */
import * as cheerio from 'cheerio';
import { setTimeout as sleep } from 'node:timers/promises';
import { EngineError } from '../errors.js';
import { textOf } from '../html.js';
import { fetchHtml, fetchJson } from '../http.js';
import { webUrlOf } from '../urls.js';

/** @typedef {import('./index.js').Download} Download */

// The size pill, "📦 1.29 GB": binary units (the file's 1,382,756,860 bytes, per VegaDrive's own
// API, are 1.29 GiB).
const UNITS = { KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 };
const SIZE = /(\d+(?:\.\d+)?)\s*(KB|MB|GB|TB)\b/;
// The script's URLs, as JSON strings: `const prepareUrl = "https:\/\/one.vegadrive.me\/..."`.
const SCRIPT_URL = (name) => new RegExp(`\\b${name}\\s*=\\s*("(?:[^"\\\\]|\\\\.)*")`);
// As the page's script: it asks again after `retry_after_ms` (1.5 to 5 s), and gives up after 90 s.
// A consumer that answers sooner waits less (`waitMs`).
const WAIT_MS = 90_000;
// The file is on Google: the page's script takes no other destination.
const FILE_HOST = /\.(?:googleusercontent|googlevideo)\.com$/;

/**
 * Reads a VegaDrive file page, and follows its Vegadrop button to the file.
 *
 * @param {string} url - On VegaDrive's current domain.
 * @param {import('../http.js').RequestOptions & { waitMs?: number }} [options] `waitMs`: how long
 *   Vegadrop's link is waited for, 90 s by default, as its page does.
 * @returns {Promise<{ filename: string, sizeBytes: number, downloads: Download[] }>} `downloads`:
 *   Vegadrop first, `direct`, or its button's own
 *   link, a page, when it cannot be followed; then each mirror, a page, by its name ("telegram").
 * @throws {EngineError} `unrecognized` for a page without the file's name or a size it can read,
 *   or without downloads; and fetchHtml's errors (`notFound`: a deleted file answers HTTP 404).
 */
export async function resolveVegaDrive(url, options) {
  const page = await fetchHtml(url, options);
  const $ = cheerio.load(page.html, { baseURI: page.url });
  const filename = textOf($('.file-name-head').first());
  const pill = $('.meta-pill').toArray().map((element) => SIZE.exec(textOf($(element)))).find(Boolean);
  if (!filename || !pill) throw new EngineError('unrecognized', 'No file name or size on the VegaDrive file page', { url });
  const [, amount, unit] = pill;

  const session = cookiesOf(page.headers);
  const primary = $('a.btn-download-primary[href]').first();
  const mirrors = $('.mirrors-grid a[href]').toArray().map((a) => ({
    server: new URL($(a).prop('href')).pathname.split('/').filter(Boolean).at(-1) ?? 'other',
    kind: 'page',
    url: $(a).prop('href'),
    // Its name, without the arrow beside it: "Telegram", not "Telegram →".
    label: textOf($(a).find('img + span').first()) || textOf($(a)),
  }));
  const downloads = [
    ...(primary.length > 0 ? [await vegadropOf(primary.prop('href'), textOf(primary.find('.primary-link-content > span').first()) || textOf(primary), { ...options, session, referer: page.url })] : []),
    ...mirrors,
  ];
  if (downloads.length === 0) throw new EngineError('unrecognized', 'No downloads on the VegaDrive file page', { url });
  return { filename, sizeBytes: Math.round(Number(amount) * UNITS[unit]), downloads };
}

/**
 * Follows Vegadrop's button to the file, in the file page's session.
 *
 * @param {string} url - The button's link: "/d/<id>/skydrop".
 * @param {string} label - Its text: "Vegadrop (10Gbps Direct)".
 * @returns {Promise<Download>} The file, `direct`; or the button's own link, a page, when the
 *   steps fail, are not ready within `waitMs`, or lead elsewhere than Google.
 */
async function vegadropOf(url, label, { session, referer, waitMs = WAIT_MS, ...options }) {
  const button = { server: 'vegadrop', kind: 'page', url, label };
  try {
    const jar = new Map(session);
    const headersOf = (accept) => ({ ...options.headers, Cookie: [...jar].map(([name, value]) => `${name}=${value}`).join('; '), Referer: referer, ...(accept && { Accept: accept }) });
    const page = await fetchHtml(url, { ...options, headers: headersOf() });
    for (const [name, value] of cookiesOf(page.headers)) jar.set(name, value);
    const prepareUrl = scriptUrlOf(page.html, 'prepareUrl');
    const linkUrl = scriptUrlOf(page.html, 'linkUrl');
    if (!prepareUrl || !linkUrl) return button;

    const json = { ...options, headers: headersOf('application/json') };
    const deadline = Date.now() + waitMs;
    for (;;) {
      let answer = await fetchJson(prepareUrl, json);
      // Prepared: the link is asked for, and at times is not ready yet either (live, 2026-11-03).
      if (answer?.ready === true) answer = await fetchJson(linkUrl, json);
      if (answer?.ready === true) {
        const fileUrl = webUrlOf(answer.download_url ?? '');
        if (!fileUrl || fileUrl.protocol !== 'https:' || !FILE_HOST.test(fileUrl.hostname)) return button;
        return { ...button, kind: 'direct', url: fileUrl.href };
      }
      const wait = Math.max(1500, Math.min(5000, Number(answer?.retry_after_ms) || 2500));
      if (Date.now() + wait > deadline) return button;
      await sleep(wait, undefined, { signal: options.signal }).catch(() => {
        throw options.signal.reason;
      });
    }
  } catch (error) {
    // A step failed: the button stays as it is, a page that leads to the file in a browser.
    if (!(error instanceof EngineError)) throw error;
    return button;
  }
}

/** @returns {Map<string, string>} The cookies an answer sets, by name. */
function cookiesOf(headers) {
  const cookies = new Map();
  for (const cookie of headers?.getSetCookie?.() ?? []) {
    const [pair] = cookie.split(';');
    const at = pair.indexOf('=');
    if (at > 0) cookies.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim());
  }
  return cookies;
}

/** @returns {string | null} A URL the page's script holds, by its name; null when it holds none. */
function scriptUrlOf(html, name) {
  const literal = SCRIPT_URL(name).exec(html)?.[1];
  if (!literal) return null;
  try {
    return webUrlOf(JSON.parse(literal))?.href ?? null;
  } catch {
    return null;
  }
}
