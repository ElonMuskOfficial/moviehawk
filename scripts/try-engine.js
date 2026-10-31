/**
 * Runs the engine on one live post page, to see what it gives: node scripts/try-engine.js
 * Change POST_URL to try another post.
 */
import { createEngine } from '../src/engine/index.js';

const POST_URL = 'https://new10.hdhub4u.cl/akka-season-1-hindi-webrip-full-series/';

// The current domain of each site whose domain rotates (2026-10-31).
const domains = {
  hdhub4u: 'https://new10.hdhub4u.cl',
  '4khdhub': 'https://4khdhub.one',
  hblinks: 'https://hblinks.lol',
  hubdrive: 'https://hubdrive.bar',
  hubcloud: 'https://hubcloud.ist',
};

const engine = createEngine({ domains });

// Step 1: the post page, and its links.
const { post, links } = await engine.scrapePost(POST_URL);
console.log(post);
console.log(`${links.length} links:`, links);

// Step 2: the files the links lead to, through the gateways.
const { files, failures } = await engine.scrapeLinks(links);
console.log(`${files.length} files:`, files);
console.log(`${failures.length} failures:`, failures.map(({ code, url, message }) => ({ code, url, message })));
