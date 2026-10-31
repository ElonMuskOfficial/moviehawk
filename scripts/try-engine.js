/**
 * Runs the engine on one live post page, to see what it gives: node scripts/try-engine.js
 * Change POST_URL to try another post.
 */
import { scrapePost } from '../src/engine/index.js';

const POST_URL = 'https://new10.hdhub4u.cl/akka-season-1-hindi-webrip-full-series/';

// The current domain of each site whose domain rotates (2026-10-31).
const domains = {
  hdhub4u: 'https://new10.hdhub4u.cl',
  '4khdhub': 'https://4khdhub.one',
};

const { post, links } = await scrapePost(POST_URL, { domains });
console.log(post);
console.log(`${links.length} links:`, links);
