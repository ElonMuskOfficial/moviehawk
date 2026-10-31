/**
 * Runs the engine on live pages, to see what it gives: node scripts/try-engine.js
 * Change SITE_URL and PAGE to read another listing page, QUERY to search, POST_URL to try another
 * post, url to follow another link, and fileUrl to resolve another file. Uncomment a step to run it.
 */
import { createEngine } from '../src/engine/index.js';

const SITE_URL = 'https://4khdhub.one'; // or 'https://new10.hdhub4u.cl'
const PAGE = 1; // of the listing or the search, from 1; a page after the last is notFound

// The current domain of each site whose domain rotates (2026-10-31).
const domains = {
  hdhub4u: 'https://new10.hdhub4u.cl',
  '4khdhub': 'https://4khdhub.one',
  hblinks: 'https://hblinks.lol',
  hubdrive: 'https://hubdrive.bar',
  hubcloud: 'https://hubcloud.ist',
};

const engine = createEngine({ domains });

/*
// Step 0: one listing page, and its posts.
console.log(`Listing page ${PAGE} of ${SITE_URL}`);
const { posts } = await engine.scrapeListing(SITE_URL, PAGE);
console.log(`${posts.length} posts:`, posts);
*/

// Search: the posts that match QUERY, as the site's search box finds them. A page after the last
// is notFound; nothing matching is no posts.
const QUERY = 'mirzapur';
console.log(`Searching ${SITE_URL} for "${QUERY}", page ${PAGE}`);
const found = await engine.searchPosts(SITE_URL, QUERY, PAGE);
console.log(`${found.posts.length} posts, hasNextPage ${found.hasNextPage}:`, found.posts);

/*
// Step 1: the post page, and its links. POST_URL can be one of step 0's: posts[0].url.
const POST_URL = 'https://new10.hdhub4u.cl/akka-season-1-hindi-webrip-full-series/';
const { post, links } = await engine.scrapePost(POST_URL);
console.log(post);
console.log(`${links.length} links:`);
links.forEach(({ label }, i) => console.log(`  ${i}: ${label}`));

// Step 2: the files the selected link leads to, through the gateways.
// The URL of the link to follow, such as one of step 1's: links[1].url.
const url = 'https://hblinks.lol/archives/121857';
console.log(`\nFollowing ${url}`);
const { files } = await engine.scrapeLinks([url]);
console.log(`${files.length} files:`, files);

// Step 3: the downloads of the selected file, such as one of step 2's: files[0].url (HubCloud only).
const fileUrl = 'https://hubcloud.ist/drive/d191b9adqj9q9zw';
console.log(`\nResolving ${fileUrl}`);
const { filename, sizeBytes, downloads } = await engine.resolve(fileUrl);
console.log({ filename, sizeBytes });
console.log(`${downloads.length} downloads:`, downloads);
*/
