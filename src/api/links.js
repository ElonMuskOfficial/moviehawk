/**
 * A link (README.md, The API): GetLink, the page a user would choose on, as the sites lead there.
 */
import { identify } from '../engine/index.js';
import { queryOf } from './cache.js';
import { isWebUrl, linkHost, linkName, namedLink, postName, urlOfId } from './names.js';
import { ProblemError } from './problems.js';

// The pages opened on the way, as a user would: each leads to one place. GreenMotors gives one
// destination; a HubDrive file page, one HubCloud file, at times with a Telegram link (live,
// 2026-11-01: 327 GreenMotors pages, 224 HubDrive file pages, of 100 posts). A HubDrive pack and
// HUBLinks are where the user chooses.
const isGreenMotors = (url) => identify(url)?.id === 'greenmotors';
const isHubDriveFile = (url) => identify(url)?.id === 'hubdrive' && new URL(url).pathname.startsWith('/file/');

/**
 * A gateway page's groups as the client reads them, each link named (namedLink). The engine gives
 * every link; this is where they are chosen: every web link is kept, whatever host it is on, as on
 * a post (a host without an extractor opens in the browser); a link that is no web URL (a magnet)
 * cannot be named, and goes, and so do a line and a group left without links.
 *
 * @param {import('../engine/index.js').Section[]} sections
 */
function namedSectionsOf(sections) {
  return sections
    .map(({ title, lines }) => ({
      title,
      lines: lines
        .map(({ title: line, tags, links }) => ({ title: line, tags, links: links.filter(({ url }) => isWebUrl(url)).map(namedLink) }))
        .filter(({ links }) => links.length > 0),
    }))
    .filter(({ lines }) => lines.length > 0);
}

/**
 * What a link opens, past the pages that only lead on.
 *
 * @param {ReturnType<typeof import('../engine/index.js').createEngine>} engine
 * @param {string} url - The link's URL.
 * @param {{ signal: AbortSignal }} options
 */
async function linkOf(engine, url, options) {
  let target = url;
  if (isGreenMotors(target)) {
    const { links } = await engine.expand(target, options);
    target = links[0].url;
  }
  if (isHubDriveFile(target)) {
    // The server the engine reads, wherever the page puts it: not its Telegram link.
    const { links } = await engine.expand(target, options);
    target = links.find((link) => identify(link.url)?.resolves)?.url;
    if (!target) throw new ProblemError(404, 'notFound', 'The HubDrive file has no HubCloud server');
  }

  const kind = identify(target);
  // A post of a site the API reads (HDHub4u links the title's post on 4KHDHub): the app's own.
  if (kind?.type === 'post') return { kind: 'post', post: postName(kind.id, target) };
  if (kind?.type === 'gateway') {
    // Where the user chooses: the page's links in its groups and lines, as the engine reads them
    // (HUBLinks; a HubDrive pack, one group).
    const page = await engine.expand(target, options);
    return { kind: 'files', host: linkHost(target), url: target, title: page.title, tags: page.tags, sections: namedSectionsOf(page.sections) };
  }
  if (kind?.resolves) {
    const { filename, sizeBytes, downloads } = await engine.resolve(target, options);
    return { kind: 'file', host: linkHost(target), url: target, filename, sizeBytes, downloads };
  }
  // A host the engine does not read, or a site it does not know: the user opens it there.
  return { kind: 'external', host: linkHost(target), url: target };
}

const linkParams = { type: 'object', required: ['link'], properties: { link: { type: 'string', minLength: 1 } } };

const nullable = (type) => ({ type: [type, 'null'] });

const download = {
  type: 'object',
  required: ['server', 'kind', 'url', 'label'],
  properties: {
    server: { type: 'string' },
    kind: { type: 'string', enum: ['direct', 'page'] },
    url: { type: 'string' },
    label: { type: 'string' },
  },
};

// One shape for the four kinds: each has its own fields (README.md, GetLink).
const link = {
  type: 'object',
  required: ['name', 'kind'],
  properties: {
    name: { type: 'string' },
    kind: { type: 'string', enum: ['files', 'file', 'post', 'external'] },
    // files: the page's title, what it states of itself (a pack's "Includes 9 files", "Total Size:
    // 23.61 GB"), and its groups of lines of links
    title: nullable('string'),
    tags: { type: 'array', items: { type: 'string' } },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        required: ['title', 'lines'],
        properties: {
          title: nullable('string'),
          lines: {
            type: 'array',
            items: {
              type: 'object',
              required: ['title', 'tags', 'links'],
              properties: {
                title: nullable('string'),
                // what the page states of the line's file beside it (a pack's size), as it gives it
                tags: { type: 'array', items: { type: 'string' } },
                links: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['name', 'url', 'label', 'host'],
                    properties: { name: { type: 'string' }, url: { type: 'string' }, label: nullable('string'), host: { type: 'string' } },
                  },
                },
              },
            },
          },
        },
      },
    },
    // file
    filename: nullable('string'),
    sizeBytes: nullable('integer'),
    downloads: { type: 'array', items: download },
    // post: its name, read by GetPost
    post: { type: 'string' },
    // files, file and external: the page the link opens on its site (its source), and that site
    // (linkHost: the engine's id, or the hostname of one it does not know)
    host: { type: 'string' },
    url: { type: 'string' },
  },
};

// How long an answer is kept, by its kind: a file's downloads expire, but not within 5 minutes;
// where a link leads hardly changes.
const TTL_MS = { files: 60 * 60_000, file: 5 * 60_000, post: 60 * 60_000, external: 60 * 60_000 };

/**
 * @param {import('fastify').FastifyInstance} app
 * @param {{ engine: ReturnType<typeof import('../engine/index.js').createEngine>, cached: ReturnType<typeof import('./cache.js').createCache> }} options
 *   `cached`: the app's cache.
 */
export async function linksRoutes(app, { engine, cached }) {
  app.get('/v1/links/:link', {
    schema: { params: linkParams, querystring: queryOf(), response: { 200: link } },
  }, async (request, reply) => {
    const { link: id } = request.params;
    const url = urlOfId(id);
    if (!url) throw new ProblemError(400, 'invalidArgument', `Not the name of a link: links/${id}`);
    return cached(request, reply, ({ kind }) => TTL_MS[kind], async () => ({
      name: linkName(url),
      ...(await linkOf(engine, url, { signal: request.signal })),
    }));
  });
}
