/**
 * A link's files and a file's downloads (README.md, The API): ListFiles, GetFile.
 */
import { fileName, urlOfId } from './names.js';
import { ProblemError } from './problems.js';

// The URL a link's or a file's name stands for; 400 for a name the API did not make.
function urlOf(id, kind) {
  const url = urlOfId(id);
  if (!url) throw new ProblemError(400, 'invalidArgument', `Not the name of a ${kind}: ${kind}s/${id}`);
  return url;
}

// Every segment of a name is at least 1 character, as in sites.js.
const idParams = (key) => ({ type: 'object', required: [key], properties: { [key]: { type: 'string', minLength: 1 } } });

const linkFile = {
  type: 'object',
  required: ['name', 'host', 'url', 'label'],
  properties: {
    name: { type: 'string' },
    host: { type: 'string' },
    url: { type: 'string' },
    label: { type: ['string', 'null'] },
  },
};

const failure = {
  type: 'object',
  required: ['code', 'url', 'detail'],
  properties: { code: { type: 'string' }, url: { type: ['string', 'null'] }, detail: { type: 'string' } },
};

const fileList = {
  type: 'object',
  required: ['files', 'failures'],
  properties: { files: { type: 'array', items: linkFile }, failures: { type: 'array', items: failure } },
};

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

const resolvedFile = {
  type: 'object',
  required: ['name', 'filename', 'sizeBytes', 'downloads'],
  properties: {
    name: { type: 'string' },
    filename: { type: 'string' },
    sizeBytes: { type: 'integer' },
    downloads: { type: 'array', items: download },
  },
};

/**
 * @param {import('fastify').FastifyInstance} app
 * @param {{ config: import('./domains.js').LiveConfig, cached: ReturnType<typeof import('./cache.js').createCache> }} options
 *   `config`: the engine, for each request. `cached`: the app's cache.
 */
export async function filesRoutes(app, { config, cached }) {
  app.get('/v1/links/:link/files', {
    schema: { params: idParams('link'), response: { 200: fileList } },
  }, async (request, reply) => {
    const url = urlOf(request.params.link, 'link');
    // A link's files hardly change; an answer with failures is not kept, as a page on the way that
    // was slow (a stalled HubDrive) gives its files on the next try.
    const ttl = ({ failures }) => (failures.length > 0 ? 0 : 60 * 60_000);
    return cached(request, reply, ttl, async () => {
      const { files, failures } = await config.current(request.log).engine.scrapeLinks([url], { signal: request.signal });
      return {
        files: files.map((file) => ({ name: fileName(file.url), host: file.host, url: file.url, label: file.label })),
        failures: failures.map((error) => ({ code: error.code, url: error.url, detail: error.message })),
      };
    });
  });

  app.get('/v1/files/:file', {
    schema: { params: idParams('file'), response: { 200: resolvedFile } },
  }, async (request, reply) => {
    const url = urlOf(request.params.file, 'file');
    // Its downloads expire, but not within 5 minutes.
    return cached(request, reply, 5 * 60_000, async () => {
      const { filename, sizeBytes, downloads } = await config.current(request.log).engine.resolve(url, { signal: request.signal });
      return { name: fileName(url), filename, sizeBytes, downloads };
    });
  });
}
