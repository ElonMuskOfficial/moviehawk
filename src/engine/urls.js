/**
 * How the engine tells which site a URL is on: by a label of its hostname, never by a substring of
 * the URL ("https://t.me/hubcloudreport" is not HubCloud). A label, not a whole domain, because the
 * domains rotate (hubcloud.ist, hubcloud.foo, dl.hubcloud.link, ...) while the label stays.
 */

/**
 * @param {string} text - A link as a page gives it.
 * @returns {URL | null} null for text that is not a web (http or https) URL: pages link all kinds
 *   of text, and have typos such as "hhttps://hubcloud.ist/...".
 */
export function webUrlOf(text) {
  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
}

/**
 * @param {URL} url
 * @param {string} label - such as "hubcloud"
 * @returns {boolean} Whether one of the hostname's labels is `label` (hostnames are lower case).
 */
export function hasLabel(url, label) {
  return url.hostname.split('.').includes(label);
}
