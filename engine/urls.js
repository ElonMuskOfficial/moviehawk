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

/**
 * Moves a URL to the current domain of its site, when `domains` names one for a label of it:
 * posts keep linking domains that no longer answer (hblinks.pro, hubdrive.live, hubcloud.foo).
 *
 * @param {URL} url
 * @param {Record<string, string>} domains - The current domain of each site whose domain rotates,
 *   by its label: { hblinks: 'https://hblinks.lol' }.
 * @returns {string}
 */
export function onCurrentDomain(url, domains) {
  const label = Object.keys(domains).find((key) => hasLabel(url, key));
  if (!label) return url.href;
  // The path after the current origin: the link's own port and credentials are not kept. Joined,
  // not resolved against it, where a path "//127.0.0.1" would name another host.
  return new URL(`${domains[label]}${url.pathname}${url.search}${url.hash}`).href;
}
