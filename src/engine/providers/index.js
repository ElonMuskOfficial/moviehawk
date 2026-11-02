/**
 * The providers the engine reads, and what every provider's post page gives. A provider is matched
 * by a label of the URL's hostname (urls.js): new10.hdhub4u.cl is HDHub4u.
 */
import { hasLabel, webUrlOf } from '../urls.js';
import { scrape4kHdHubListing, scrape4kHdHubPost, search4kHdHub } from './4khdhub.js';
import { scrapeHdHub4uListing, scrapeHdHub4uPost, searchHdHub4u } from './hdhub4u.js';

/**
 * @typedef {{ provider: string, url: string, title: string, year: number | null,
 *   imdbId: string | null, posterUrl: string | null, publishedAt: string | null }} Post
 *   `url`: the post's address after redirects; `publishedAt`: ISO 8601, UTC.
 * @typedef {{ url: string, title: string, posterUrl: string | null }} PostCard
 *   A post as a listing page shows it: its card's title and image, as the card states them.
 * @typedef {{ title: string | null, lines: Line[], tab: string | null, tags: string[], episodes: boolean }} Section
 *   A group of a post's download links, as its site groups them: ": DOWNLOAD LINKS :",
 *   "EPiSODE 1", "S01 1080p WEB-DL H264". `title`: the site's, as it writes it; null where it gives
 *   none. Every provider reads its own post page into this one shape, every field filled
 *   (sections.js); a section has at least one line. What a site states beyond its title, by its
 *   page's structure, is null, [] or false where it states none: `tab`, the label of
 *   the tab the section is in ("Zip/Pack", "Single EP's"); `tags`, its badges ("Episodes 4",
 *   "English"); `episodes`, whether it is a season's group of episodes, one line each (4KHDHub's
 *   `.season-item`).
 * @typedef {{ title: string | null, links: import('../html.js').Link[], file: string | null, tags: string[] }} Line
 *   A line of buttons: "720p – Drive | Instant". `title`: what the line names ("720p", a file,
 *   "Episode-01"); null for a line of buttons only. A line has at least one link; a link's label is
 *   its button. Null or [] where the site states none: `file`, the name of its file
 *   ("Lupin.S04E01.1080p.mkv"); `tags`, its badges as the site gives them ("4.01 GB", "English").
 */

// Each provider's id is also the hostname label that identifies it. `post` reads one post page,
// `listing` one listing page, `search` one page of the site's search results.
const PROVIDERS = [
  { id: 'hdhub4u', post: scrapeHdHub4uPost, listing: scrapeHdHub4uListing, search: searchHdHub4u },
  { id: '4khdhub', post: scrape4kHdHubPost, listing: scrape4kHdHubListing, search: search4kHdHub },
];

/** The ids of the providers the engine reads: "hdhub4u", "4khdhub". */
export const providerIds = Object.freeze(PROVIDERS.map(({ id }) => id));

/**
 * @param {string} url
 * @returns {typeof PROVIDERS[number] | null} null when the URL is on no site the engine reads.
 */
export function providerOf(url) {
  const parsed = webUrlOf(url);
  return (parsed && PROVIDERS.find(({ id }) => hasLabel(parsed, id))) ?? null;
}
