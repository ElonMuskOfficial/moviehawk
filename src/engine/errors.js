const CODES = new Set(['notFound', 'transient', 'unrecognized', 'unsupported']);

/**
 * The one error the engine throws. Its `code` says what the site said, so a caller decides by the
 * code, never by the message:
 *
 * - `notFound`: the site said it is gone: HTTP 404 or 410, or the host's own "not found" page;
 * - `transient`: the site did not answer: a timeout, a network error, any HTTP error but 404 and 410;
 * - `unrecognized`: a page the engine cannot read: a changed layout or a challenge page;
 * - `unsupported`: a URL no provider or host of the engine handles.
 */
export class EngineError extends Error {
  /**
   * @param {'notFound' | 'transient' | 'unrecognized' | 'unsupported'} code
   * @param {string} message
   * @param {{ url?: string | null, cause?: unknown }} [details]
   *   `url`: the page that failed; `cause`: the error underneath (a network error, a timeout).
   * @throws {TypeError} For a code that is not one of the four: a caller comparing codes would
   *   never match it.
   */
  constructor(code, message, { url = null, cause } = {}) {
    if (!CODES.has(code)) throw new TypeError(`Unknown EngineError code: ${code}`);
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'EngineError';
    this.code = code;
    this.url = url;
  }
}
