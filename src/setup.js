/**
 * The HTTP API (README.md, The API). Every response has a `Request-Id`, and every error is a problem
 * (problems.js).
 */
import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import { createCache } from './cache.js';
import { PROBLEM_TYPE, problem, problemOf } from './problems.js';
import { linksRoutes } from './links.js';
import { sitesRoutes } from './sites.js';

// Names are long: a GreenMotors link's is up to 540 characters, an HDHub4u post's up to 143
// (README.md, Names). Fastify's default, 100, would make them HTTP 414.
const MAX_PARAM_LENGTH = 2048;

// The most a request may take. GetLink takes 1 to 6 s live, 10 s when 10Gbps is slow; a host that
// stalls through every retry would hold it about a minute.
const HANDLER_TIMEOUT_MS = 30_000;

/**
 * @param {import('fastify').FastifyReply} reply
 * @param {ReturnType<typeof problem>} body
 */
function sendProblem(reply, body) {
  return reply.code(body.status).type(PROBLEM_TYPE).send(body);
}

/**
 * The API's Fastify options. The server's entrypoint (server.js) makes its Fastify with them, as
 * Fastify's own boilerplate does, and so does buildApp.
 *
 * @param {{ logger?: boolean }} [options] `logger`: Fastify's request log, to stdout.
 * @returns {import('fastify').FastifyServerOptions}
 */
export function appOptions({ logger = false } = {}) {
  return {
    // Pino's lines say "name": "moviehawk", not the machine's hostname and the process id, which
    // name nothing a reader of the log needs (base: undefined drops them).
    logger: logger && { name: 'moviehawk', base: undefined },
    // Each request gets its own id; a client's own `Request-Id` header is not taken, so an id in
    // the log is always the server's (Fastify's requestIdHeader is false by default).
    genReqId: () => randomUUID(),
    routerOptions: { maxParamLength: MAX_PARAM_LENGTH },
    // On the timeout, or when the client disconnects, request.signal aborts: the routes pass it to
    // the engine, which stops its requests to the sites.
    handlerTimeout: HANDLER_TIMEOUT_MS,
    // Errors before routing (a URL that does not decode, a name over MAX_PARAM_LENGTH) are
    // problems too. Hooks do not run for them, so the id is set here.
    frameworkErrors: (error, request, reply) => {
      reply.header('request-id', request.id);
      return sendProblem(reply, problem(error.statusCode ?? 400, 'invalidArgument', error.message));
    },
  };
}

/**
 * Sets the API up on a Fastify made with appOptions: every response's `Request-Id`, every error as
 * a problem, and the routes.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {{ engine: ReturnType<typeof import('../engine/index.js').createEngine>, domains: Record<string, string> }} options
 *   `engine`: made with `domains`, the current domains (domains.js).
 */
export async function setUpApp(app, { engine, domains }) {
  app.addHook('onRequest', async (request, reply) => {
    reply.header('request-id', request.id);
  });

  app.setErrorHandler((error, request, reply) => {
    const body = problemOf(error);
    // A client that disconnected (the signal's AbortError, which the engine passes on) reads
    // nothing, and nothing failed.
    const clientGone = error?.name === 'AbortError' && request.signal.aborted;
    if (body.status >= 500 && !clientGone) request.log.error(error);
    return sendProblem(reply, body);
  });

  app.setNotFoundHandler((request, reply) => sendProblem(reply, problem(404, 'notFound', `No route ${request.method} ${request.url}`)));

  const cached = createCache();
  await app.register(sitesRoutes, { engine, domains, cached });
  await app.register(linksRoutes, { engine, cached });
}

/**
 * The API's server, not yet listening, for requests a caller injects (the tests).
 *
 * @param {{ engine: ReturnType<typeof import('../engine/index.js').createEngine>, domains: Record<string, string>, logger?: boolean }} options
 */
export async function buildApp({ engine, domains, logger = false }) {
  const app = Fastify(appOptions({ logger }));
  await setUpApp(app, { engine, domains });
  return app;
}
