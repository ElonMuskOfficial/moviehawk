/**
 * Runs the engine on one live post page, to see what it gives: node scripts/try-engine.js
 * Change POST_URL to try another post, and link to follow another link.
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
console.log(`${links.length} links:`);
links.forEach(({ label }, i) => console.log(`  ${i}: ${label}`));

// Step 2: the files the selected link leads to, through the gateways.
// A link as step 1 gives it: { url, label }.
const link = {
  url: 'https://greenmotors.club/?id=cUk4cEpVbFU1NW8yUVR1ZVFUM3phNm5QS2Z3TTdCSkVpS1pqdjdkTHQ5bDlqUGNSMTVIWDk5d05BZDVIa3R2QkRla3o2ektFaFhld2Y4NWhJZTgvZzZLNTZaN2lndkpMNTJWcXBONzFDdjg9',
  label: null,
};
console.log(`\nFollowing ${link}`);
const { files, failures } = await engine.scrapeLinks([link]);
console.log(`${files.length} files:`, files);
console.log(`${failures.length} failures:`, failures.map(({ code, url, message }) => ({ code, url, message })));
