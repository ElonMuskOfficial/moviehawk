/**
 * The engine: what a consumer (the crawler, the API, the bot) imports, and all it imports. One
 * function per layer of the sites; the consumer makes its own flow from them:
 *
 *   const engine = createEngine({ domains });
 *   engine.scrapeListing(siteUrl, page)      → its posts' cards: URL, title, poster
 *   engine.searchPosts(siteUrl, query, page) → the cards of the posts that match
 *   engine.scrapePost(postUrl)               → the post and its download links, in sections
 *   identify(linkUrl)                        → what the link is: a gateway page, a file on a host, a post
 *   providerIds                              → the sites the engine reads: "hdhub4u", "4khdhub"
 *   engine.expand(gatewayUrl)                → where the gateway's page leads: its links
 *   engine.resolve(fileUrl)                  → the file's name, size and downloads
 *
 * Every function throws EngineError. The engine keeps no state of its own: the config it is made
 * with is all it knows, and it never changes it.
 */
import { resolve } from './files.js';
import { expand } from './links.js';
import { scrapeListing } from './listings.js';
import { scrapePost } from './posts.js';
import { searchPosts } from './searches.js';

export { EngineError } from './errors.js';
export { identify } from './links.js';
export { providerIds } from './providers/index.js';

/**
 * @typedef {import('./providers/index.js').Post} Post
 * @typedef {import('./providers/index.js').PostCard} PostCard
 * @typedef {import('./providers/index.js').Section} Section
 * @typedef {import('./providers/index.js').Line} Line
 * @typedef {import('./html.js').Link} Link
 * @typedef {import('./links.js').LinkKind} LinkKind
 * @typedef {import('./hosts/index.js').Download} Download
 */

/**
 * Makes the engine with the consumer's config, so every call has the same: a call without
 * `domains` would read dead domains (hblinks.pro, hubcloud.foo) and fail as if the sites were down.
 *
 * @param {{ domains?: Record<string, string>, fetch?: typeof fetch, timeoutMs?: number }} [config]
 *   `domains`: the current domain of each site whose domain rotates, by its hostname label
 *   (`{ hdhub4u: 'https://new10.hdhub4u.cl', hubcloud: 'https://hubcloud.ist' }`); every URL is
 *   moved to it before it is read. When a domain changes, make a new engine. `fetch`, `timeoutMs`:
 *   for every request (http.js).
 * @returns The engine's functions. A call's own option goes with the call: `signal`.
 */
export function createEngine(config = {}) {
  const withConfig = (options) => ({ ...options, ...config });
  return {
    scrapeListing: (url, page, options) => scrapeListing(url, page, withConfig(options)),
    searchPosts: (url, query, page, options) => searchPosts(url, query, page, withConfig(options)),
    scrapePost: (url, options) => scrapePost(url, withConfig(options)),
    expand: (url, options) => expand(url, withConfig(options)),
    resolve: (url, options) => resolve(url, withConfig(options)),
  };
}
