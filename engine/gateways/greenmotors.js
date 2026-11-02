/**
 * GreenMotors (greenmotors.cc/?id=<token>): an ad gateway in front of most download buttons. Its
 * page hides the destination in a script call, s('o', '<token>'), which is decoded here instead of
 * waiting out the page's countdown.
 */
import { EngineError } from '../errors.js';
import { fetchHtml } from '../http.js';

// The destination is data in an inline script, not markup, so a regex on that call reads it.
const TOKEN = /s\(\s*['"]o['"]\s*,\s*['"]([^'"]+)['"]/;
// GreenMotors' whole answer for a link it no longer knows, or a token it cannot read (seen live on
// 2026-10-28 and 2026-10-29).
const DEAD_LINK = /^\s*(?:Invalid Link\s*!*|Failed to decode link)\s*$/i;

const fromBase64 = (text) => Buffer.from(text, 'base64').toString('utf8');

const rot13 = (text) => text.replace(/[a-z]/gi, (letter) => {
  const a = letter <= 'Z' ? 65 : 97;
  return String.fromCharCode(((letter.charCodeAt(0) - a + 13) % 26) + a);
});

/**
 * The destination in a GreenMotors page: the token is base64 of base64 of ROT13 of base64 of a
 * JSON object, whose `o` is the destination in base64 (live, 2026-10-31: 39 of 39 links).
 *
 * @param {string} html
 * @returns {string | null} Any URL, as the page states it (a torrent's magnet too: which to follow is
 *   the caller's); null when the page has no token, or one that does not decode to a URL.
 */
function destinationOf(html) {
  const token = TOKEN.exec(html)?.[1];
  if (!token) return null;
  try {
    const { o } = JSON.parse(fromBase64(rot13(fromBase64(fromBase64(token)))));
    const destination = typeof o === 'string' ? fromBase64(o) : '';
    return URL.canParse(destination) ? destination : null;
  } catch {
    return null; // Not JSON: the token is not one GreenMotors' script would read either.
  }
}

/**
 * Reads one GreenMotors page and returns where it leads. The destination can be another GreenMotors
 * link; following it is the caller's choice.
 *
 * @param {string} url - As a post links it: greenmotors.club, which redirects to greenmotors.cc (live,
 *   2026-11-01).
 * @param {import('../http.js').RequestOptions} [options]
 * @returns {Promise<{ links: import('../html.js').Link[] }>} The one destination, without a label
 *   (it is in the page's script, not on the page).
 * @throws {EngineError} `notFound` when GreenMotors says the link is dead, `unrecognized` for a page
 *   without a destination, and fetchHtml's errors.
 */
export async function expandGreenMotors(url, options) {
  const { html } = await fetchHtml(url, options);
  const destination = destinationOf(html);
  if (destination) return { links: [{ url: destination, label: null }] };
  if (DEAD_LINK.test(html)) throw new EngineError('notFound', 'GreenMotors says the link is dead', { url });
  throw new EngineError('unrecognized', 'No destination on the GreenMotors page', { url });
}
