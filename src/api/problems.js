/**
 * Errors as RFC 9457 problem details (docs/api.md, Errors): one shape for every error the API
 * gives, with the cause as the extension `code`.
 */
import { STATUS_CODES } from 'node:http';
import { EngineError } from '../engine/index.js';

export const PROBLEM_TYPE = 'application/problem+json';

// The engine's codes, by what the site said (docs/engine.md).
const STATUS_BY_ENGINE_CODE = {
  notFound: 404,
  unsupported: 400,
  unrecognized: 502,
  transient: 504,
};

/**
 * @param {number} status
 * @param {string} code - `notFound`, `invalidArgument`, ... (docs/api.md, Errors).
 * @param {string} detail - For the client to read: what failed.
 */
export function problem(status, code, detail) {
  return { type: 'about:blank', title: STATUS_CODES[status], status, detail, code };
}

/** An error a route throws to answer with a problem of its own: a site the API does not have. */
export class ProblemError extends Error {
  /** @param {number} status @param {string} code @param {string} detail */
  constructor(status, code, detail) {
    super(detail);
    this.name = 'ProblemError';
    this.problem = problem(status, code, detail);
  }
}

/**
 * The problem an error thrown while answering a request is.
 *
 * @param {unknown} error
 * @returns {ReturnType<typeof problem>} A ProblemError's own; an EngineError by its code; an error
 *   Fastify made for the request (its schema validation, a malformed URL: a 4xx `statusCode`) as
 *   `invalidArgument`; anything else as 500 `internal`, without its message, which is for the log,
 *   not the client.
 */
export function problemOf(error) {
  if (error instanceof ProblemError) return error.problem;
  if (error instanceof EngineError) return problem(STATUS_BY_ENGINE_CODE[error.code], error.code, error.message);
  const status = error?.statusCode;
  if (Number.isInteger(status) && status >= 400 && status < 500) return problem(status, 'invalidArgument', error.message);
  return problem(500, 'internal', 'The API failed to answer');
}
