/**
 * A link's files and a file's downloads (docs/api.md): ListFiles, GetFile.
 */
import { fileName, urlOfId } from './names.js';
import { ProblemError } from './problems.js';

// The URL a link's or a file's name stands for; 400 for a name the API did not make.
function urlOf(id, kind) {
  const url = urlOfId(id);
  if (!url) throw new ProblemError(400, 'invalidArgument', `Not the name of a ${kind}: ${kind}s/${id}`);
  return url;
}

const idParams = (key) => ({ type: 'object', required: [key], properties: { [key]: { type: 'string', minLength: 1 } } });

const nullableString = { type: ['string', 'null'] };

/**
 * @param {import('fastify').FastifyInstance} app
 * @param {{ engine: ReturnType<typeof import('../engine/index.js').createEngine> }} options
 */
export async function filesRoutes(app, { engine }) {
  app.get('/v1/links/:link/files', {
    schema: {
      summary: 'ListFiles',
      params: idParams('link'),
      response: {
        200: {
          type: 'object',
          required: ['files', 'failures'],
          properties: {
            files: {
              type: 'array',
              items: {
                type: 'object',
                required: ['name', 'host', 'url', 'label'],
                properties: {
                  name: { type: 'string', description: 'Its downloads: GET /v1/{name}' },
                  host: { type: 'string', examples: ['hubcloud'] },
                  url: { type: 'string', description: 'The file\'s page on its host' },
                  label: nullableString,
                },
              },
            },
            failures: {
              type: 'array',
              items: {
                type: 'object',
                required: ['code', 'url', 'detail'],
                properties: { code: { type: 'string' }, url: nullableString, detail: { type: 'string' } },
              },
            },
          },
        },
      },
    },
  }, async (request) => {
    const { files, failures } = await engine.scrapeLinks([urlOf(request.params.link, 'link')]);
    return {
      files: files.map(({ host, url, label }) => ({ name: fileName(url), host, url, label })),
      failures: failures.map(({ code, url, message }) => ({ code, url, detail: message })),
    };
  });

  app.get('/v1/files/:file', {
    schema: {
      summary: 'GetFile',
      params: idParams('file'),
      response: {
        200: {
          type: 'object',
          required: ['name', 'filename', 'sizeBytes', 'downloads'],
          properties: {
            name: { type: 'string' },
            filename: { type: 'string' },
            sizeBytes: { type: 'integer' },
            downloads: {
              type: 'array',
              items: {
                type: 'object',
                required: ['server', 'kind', 'url', 'label'],
                properties: {
                  server: { type: 'string', examples: ['10gbps', 'fsl', 'pixeldrain'] },
                  kind: { type: 'string', enum: ['direct', 'page'] },
                  url: { type: 'string' },
                  label: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  }, async (request) => {
    const url = urlOf(request.params.file, 'file');
    const { filename, sizeBytes, downloads } = await engine.resolve(url);
    return { name: fileName(url), filename, sizeBytes, downloads };
  });
}
