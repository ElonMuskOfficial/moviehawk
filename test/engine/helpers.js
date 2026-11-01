/**
 * What the engine's tests share: fake answers of the sites, in place of `fetch`.
 */

/**
 * A fake web: each URL answers with its page, or with an HTTP status; it records every request.
 *
 * @param {Record<string, string | number>} pages - By URL: the page's HTML, or an HTTP status.
 * @returns {{ fetch: typeof fetch, requests: string[] }}
 */
export function web(pages) {
  const requests = [];
  const fetchFn = async (url) => {
    requests.push(url);
    const page = pages[url];
    if (page === undefined) throw new Error(`No fake page for ${url}`);
    return typeof page === 'number' ? new Response('', { status: page }) : new Response(page);
  };
  return { fetch: fetchFn, requests };
}

/**
 * A fake site that answers every request with one page.
 *
 * @param {string} body
 * @param {{ status?: number, url?: string }} [options] `url`: where the request was redirected to;
 *   by default it was not.
 * @returns {{ fetch: typeof fetch }}
 */
export function answer(body, { status = 200, url } = {}) {
  return {
    fetch: async () => {
      const response = new Response(body, { status });
      if (url) Object.defineProperty(response, 'url', { value: url });
      return response;
    },
  };
}

/**
 * A GreenMotors page whose script stores `config` as the live pages do (2026-10-31): base64 of
 * base64 of ROT13 of base64 of its JSON.
 *
 * @param {object} config - Such as `{ o: <the destination in base64> }`.
 */
export function greenMotorsPage(config) {
  const base64 = (text) => Buffer.from(text).toString('base64');
  const rot13 = (text) => text.replace(/[a-z]/gi, (letter) => {
    const a = letter <= 'Z' ? 65 : 97;
    return String.fromCharCode(((letter.charCodeAt(0) - a + 13) % 26) + a);
  });
  return `<script>s('o','${base64(base64(rot13(base64(JSON.stringify(config)))))}',180*1000);</script>`;
}
