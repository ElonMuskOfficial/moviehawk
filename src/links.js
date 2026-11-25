/**
 * A link (README.md, The API): GetLink, the page a user would choose on, as the sites lead there.
 */
import { identify } from '../engine/index.js';
import { queryOf } from './cache.js';
import { isWebUrl, linkHost, linkName, namedSections, postName, urlOfId } from './names.js';
import { ProblemError } from './problems.js';

// The most gateway pages a link opens: the sites chain up to three (GreenMotors, HUBLinks, HubDrive).
const MAX_GATEWAYS = 3;

/**
 * What a link opens, past the gateway pages that only lead on. The engine says which those are: a
 * page where the user chooses among files (HUBLinks, a HubDrive pack) has `sections`; one that
 * leads to one place (GreenMotors, a HubDrive file page) has only its `links`, and is followed to
 * the first the engine resolves (a HubDrive file page's HubCloud server, wherever the page puts it;
 * not its Telegram link), or else its first.
 *
 * @param {ReturnType<typeof import('../engine/index.js').createEngine>} engine
 * @param {string} url - The link's URL.
 * @param {{ signal: AbortSignal }} options
 */
async function linkOf(engine, url, options) {
  let target = url;
  for (let opened = 0; ; opened++) {
    const kind = identify(target);
    // A post of a site the API reads (HDHub4u links the title's post on 4KHDHub): the app's own.
    if (kind?.type === 'post') return { kind: 'post', post: postName(kind.id, target) };
    if (kind?.type === 'file' && kind.resolves) {
      const { filename, sizeBytes, downloads } = await engine.resolve(target, options);
      // The engine gives each download as the host's page gives it; one that is no web URL
      // ("javascript:...") is no download, as a section's link that is none goes (namedSections).
      return { kind: 'file', host: linkHost(target), url: target, filename, sizeBytes, downloads: downloads.filter(({ url }) => isWebUrl(url)) };
    }
    // A host the engine does not read, or a site it does not know: the user opens it there.
    if (kind?.type !== 'gateway') return { kind: 'external', host: linkHost(target), url: target };
    if (opened === MAX_GATEWAYS) throw new ProblemError(502, 'unrecognized', `The link leads through more than ${MAX_GATEWAYS} gateway pages`);

    const page = await engine.expand(target, options);
    if (page.sections) {
      return { kind: 'files', host: linkHost(target), url: target, title: page.title, tags: page.tags, sections: namedSections(page.sections) };
    }
    const links = page.links.filter((link) => isWebUrl(link.url));
    const next = links.find((link) => identify(link.url)?.resolves) ?? links[0];
    if (!next) throw new ProblemError(404, 'notFound', `The ${linkHost(target)} page leads to no file`);
    target = next.url;
  }
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
