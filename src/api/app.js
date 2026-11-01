/**
 * The HTTP API (docs/api.md). Every response has a `Request-Id`, and every error is a problem
 * (problems.js).
 */
import { randomUUID } from 'node:crypto';
import fastifySwagger from '@fastify/swagger';
import Fastify from 'fastify';
import { PROBLEM_TYPE, problem, problemOf } from './problems.js';
import { SITES, sitesRoutes } from './sites.js';

// Names are long: a GreenMotors link's is up to 540 characters, an HDHub4u post's up to 143
// (docs/api.md, Names). Fastify's default, 100, would make them HTTP 404.
const MAX_PARAM_LENGTH = 2048;

/**
 * @param {import('fastify').FastifyReply} reply
 * @param {ReturnType<typeof problem>} body
 */
function sendProblem(reply, body) {
  return reply.code(body.status).type(PROBLEM_TYPE).send(body);
}

/**
 * Makes the API's server, not yet listening: the caller listens (scripts/api.js) or injects
 * requests (the tests).
 *
 * @param {{ engine: ReturnType<typeof import('../engine/index.js').createEngine>,
 *   domains: Record<string, string>, logger?: boolean }} options `engine`: made with the same
 *   `domains`. `domains`: the current domain of each site and gateway whose domain rotates
 *   (domains.json). `logger`: Fastify's request log, to stdout.
 * @throws {TypeError} When `domains` has no domain for a site: each of its requests would fail.
 */
export async function buildApp({ engine, domains, logger = false }) {
  const missing = SITES.filter((site) => !domains[site]);
  if (missing.length) throw new TypeError(`No domain for ${missing.join(', ')}`);

  const app = Fastify({
    logger,
    // Each request gets its own id; a client's own `Request-Id` header is not taken, so an id in
    // the log is always the server's (Fastify's requestIdHeader is false by default).
    genReqId: () => randomUUID(),
    routerOptions: { maxParamLength: MAX_PARAM_LENGTH },
    // Errors before routing (a URL that does not decode, a name over MAX_PARAM_LENGTH) are
    // problems too. Hooks do not run for them, so the id is set here.
    frameworkErrors: (error, request, reply) => {
      reply.header('request-id', request.id);
      return sendProblem(reply, problem(error.statusCode ?? 400, 'invalidArgument', error.message));
    },
  });

  app.addHook('onRequest', async (request, reply) => {
    reply.header('request-id', request.id);
  });

  app.setErrorHandler((error, request, reply) => {
    const body = problemOf(error);
    if (body.status >= 500) request.log.error(error);
    return sendProblem(reply, body);
  });

  app.setNotFoundHandler((request, reply) => sendProblem(reply, problem(404, 'notFound', `No route ${request.method} ${request.url}`)));

  await app.register(fastifySwagger, {
    openapi: {
      openapi: '3.1.0',
      info: { title: 'MovieHawk API', version: '1' },
    },
  });

  app.get('/v1/openapi.json', { schema: { hide: true } }, () => app.swagger());
  await app.register(sitesRoutes, { engine, domains });

  return app;
}
