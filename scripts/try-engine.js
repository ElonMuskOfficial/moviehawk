/**
 * Runs the engine on one live post, to see what each step gives: node scripts/try-engine.js
 * Change POST_URL to try another post.
 */
import { scrapeFile, resolve } from '../src/engine/hosts/index.js';
import { scrapeLinks } from '../src/engine/links.js';
import { scrapePost } from '../src/engine/posts.js';

const POST_URL = 'https://new10.hdhub4u.cl/mirzapur-the-movie-2026-ds4k-webrip-hindi-full-movie/';

// The current domain of each site whose domain rotates (2026-10-31).
const domains = {
  hdhub4u: 'https://new10.hdhub4u.cl',
  '4khdhub': 'https://4khdhub.one',
  greenmotors: 'https://greenmotors.cc',
  hblinks: 'https://hblinks.lol',
  hubdrive: 'https://hubdrive.bar',
  hubcloud: 'https://hubcloud.ist',
};

const timed = async (name, fn) => {
  const start = Date.now();
  const result = await fn();
  console.log(`\n=== ${name} (${Date.now() - start} ms)`);
  return result;
};

const { post, links } = await timed('1. scrapePost', () => scrapePost(POST_URL, { domains }));
console.log(post);
console.log(`${links.length} links:`, links.map(({ url }) => url));

const { files, failures } = await timed('2. scrapeLinks', () => scrapeLinks(links, { domains }));
console.table(files);
console.log(`${failures.length} failures:`, failures.map(({ code, url, message }) => `${code} ${url} (${message})`));

const hubCloudFile = files.find(({ host }) => host === 'hubcloud');
if (hubCloudFile) {
  const details = await timed('3. scrapeFile', () => scrapeFile(hubCloudFile.url));
  console.log(details);

  const resolved = await timed('4. resolve', () => resolve(hubCloudFile.url));
  console.log(resolved.filename, resolved.sizeBytes);
  console.table(resolved.downloads.map(({ server, kind, label, url }) => ({ server, kind, label, url: url.slice(0, 70) })));
}
