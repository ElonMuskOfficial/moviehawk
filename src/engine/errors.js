/**
 * The one error the engine throws. Its `code` says what the site said, so a caller decides by the
 * code, never by the message:
 *
 * - `notFound`: the site said it is gone: HTTP 404 or 410, or the host's own "not found" page;
 * - `transient`: the site did not answer: a timeout, a network error, a 5xx or 429;
 * - `unrecognized`: a page the engine cannot read: a changed layout or a challenge page;
 * - `unsupported`: a URL no provider or host of the engine handles.
 */
export class EngineError extends Error {
  /**
   * @param {'notFound' | 'transient' | 'unrecognized' | 'unsupported'} code
   * @param {string} message
   * @param {{ url?: string | null, host?: string | null, status?: number | null, cause?: unknown }} [details]
   *   `host`: the provider, gateway or host whose page failed; `status`: the HTTP status, if any;
   *   `cause`: the error underneath (a network error, a timeout).
   */
  constructor(code, message, { url = null, host = null, status = null, cause } = {}) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'EngineError';
    this.code = code;
    this.url = url;
    this.host = host;
    this.status = status;
  }
}
