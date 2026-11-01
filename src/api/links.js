/**
 * A link (README.md, The API): GetLink, the page a user would choose on, as the sites lead there.
 */
import { EngineError, identify } from '../engine/index.js';
import { queryOf } from './cache.js';
import { linkName, urlOfId } from './names.js';
import { ProblemError } from './problems.js';

// The pages opened on the way, as a user would: each leads to one place. GreenMotors gives one
// destination; a HubDrive file page, one HubCloud file, at times with a Telegram link (live,
// 2026-11-01: 327 GreenMotors pages, 224 HubDrive file pages, of 100 posts). A HubDrive pack and
// HUBLinks are where the user chooses.
const isGreenMotors = (url) => identify(url)?.id === 'greenmotors';
const isHubDriveFile = (url) => identify(url)?.id === 'hubdrive' && new URL(url).pathname.startsWith('/file/');

/**
 * What a link opens, past the pages that only lead on.
 *
 * @param {ReturnType<typeof import('../engine/index.js').createEngine>} engine
 * @param {string} url - The link's URL.
 * @param {{ signal: AbortSignal }} options
 */
async function linkOf(engine, url, options) {
  let target = url;
  if (isGreenMotors(target)) [{ url: target }] = (await engine.expand(target, options)).links;
  if (isHubDriveFile(target)) {
    // The server the engine reads, wherever the page puts it: not its Telegram link.
    const { links } = await engine.expand(target, options);
    target = links.find((link) => identify(link.url)?.resolves)?.url;
    if (!target) throw new EngineError('notFound', 'The HubDrive file has no HubCloud server', { url });
  }

  const kind = identify(target);
  if (kind?.type === 'gateway') {
    // The links the user can follow: another gateway, or a file. Each once (HUBLinks repeats one).
    const { links } = await engine.expand(target, options);
    const seen = new Set();
    const files = [];
    for (const link of links) {
      const next = identify(link.url);
      if (!next || seen.has(link.url)) continue;
      seen.add(link.url);
      files.push({ name: linkName(link.url), url: link.url, label: link.label, host: next.type === 'gateway' ? next.id : next.host });
    }
    return { kind: 'files', files };
  }
  if (kind?.resolves) {
    const { filename, sizeBytes, downloads } = await engine.resolve(target, options);
    return { kind: 'file', filename, sizeBytes, downloads };
  }
  // A host the engine does not read, or a site it does not know: the user opens it there.
  return { kind: 'external', host: kind?.host ?? null, url: target };
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

// One shape for the three kinds: each has its own fields (README.md, GetLink).
const link = {
  type: 'object',
  required: ['name', 'kind'],
  properties: {
    name: { type: 'string' },
    kind: { type: 'string', enum: ['files', 'file', 'external'] },
    // files
    files: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'url', 'label', 'host'],
        properties: { name: { type: 'string' }, url: { type: 'string' }, label: nullable('string'), host: { type: 'string' } },
      },
    },
    // file
    filename: nullable('string'),
    sizeBytes: nullable('integer'),
    downloads: { type: 'array', items: download },
    // external
    host: nullable('string'),
    url: { type: 'string' },
  },
};

// How long an answer is kept, by its kind: a file's downloads expire, but not within 5 minutes;
// where a link leads hardly changes.
const TTL_MS = { files: 60 * 60_000, file: 5 * 60_000, external: 60 * 60_000 };

/**
 * @param {import('fastify').FastifyInstance} app
 * @param {{ config: import('./domains.js').LiveConfig, cached: ReturnType<typeof import('./cache.js').createCache> }} options
 *   `config`: the engine, for each request. `cached`: the app's cache.
 */
export async function linksRoutes(app, { config, cached }) {
  app.get('/v1/links/:link', {
    schema: { params: linkParams, querystring: queryOf(), response: { 200: link } },
  }, async (request, reply) => {
    const { link: id } = request.params;
    const url = urlOfId(id);
    if (!url) throw new ProblemError(400, 'invalidArgument', `Not the name of a link: links/${id}`);
    return cached(request, reply, ({ kind }) => TTL_MS[kind], async () => ({
      name: linkName(url),
      ...(await linkOf(config.current(request.log).engine, url, { signal: request.signal })),
    }));
  });
}
