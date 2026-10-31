/**
 * The engine: what a consumer (the crawler, the API, the bot) imports, and all it imports. One
 * function per layer of the sites; the consumer makes its own flow from them:
 *
 *   scrapeListing(siteUrl, page) → post URLs
 *   scrapePost(postUrl)          → the post and its links
 *   scrapeLinks(links)           → the files they lead to
 *   scrapeFile(fileUrl)          → the file's name and size
 *   resolve(fileUrl)             → its downloads
 *
 * Every function takes `{ domains, fetch, timeoutMs, signal }` and throws EngineError. The engine
 * keeps no state: `domains`, the current domain of each site whose domain rotates, comes from the
 * consumer, on every call.
 */
export { EngineError } from './errors.js';
export { resolve, scrapeFile } from './files.js';
export { scrapeLinks } from './links.js';
export { scrapeListing } from './listings.js';
export { scrapePost } from './posts.js';

/**
 * @typedef {import('./providers/index.js').Post} Post
 * @typedef {import('./html.js').Link} Link
 * @typedef {import('./hosts/index.js').HostFile} HostFile
 * @typedef {import('./hosts/index.js').Download} Download
 * @typedef {import('./links.js').EngineEvent} EngineEvent
 */
