/**
 * The sites and their posts (docs/api.md): ListSites, ListPosts, SearchPosts.
 */
import { postName } from './names.js';
import { ProblemError } from './problems.js';

// The sites the engine reads posts of. Vegamovies and RogMovies come with their provider.
export const SITES = ['hdhub4u', '4khdhub'];

// A page number, as the API gives it in nextPageToken: from 1. At most 6 digits (the sites have
// under 1,000 pages): a longer one would be read as 1e+21 and make a wrong URL.
const pageToken = { type: 'string', pattern: '^[1-9][0-9]{0,5}$', description: 'The nextPageToken of the page before' };

const postCard = {
  type: 'object',
  required: ['name', 'title', 'posterUrl'],
  properties: {
    name: { type: 'string', examples: ['sites/hdhub4u/posts/akka-season-1-hindi-webrip-full-series'] },
    title: { type: 'string' },
    posterUrl: { type: ['string', 'null'] },
  },
};

const postPage = {
  type: 'object',
  required: ['posts'],
  properties: {
    posts: { type: 'array', items: postCard },
    nextPageToken: { type: 'string', description: 'Absent on the last page' },
  },
};

const siteParams = {
  type: 'object',
  required: ['site'],
  properties: { site: { type: 'string', examples: SITES } },
};

/**
 * @param {import('fastify').FastifyInstance} app
 * @param {{ engine: ReturnType<typeof import('../engine/index.js').createEngine>,
 *   domains: Record<string, string> }} options `domains`: the current domain of each site.
 */
export async function sitesRoutes(app, { engine, domains }) {
  const siteUrlOf = (site) => {
    if (!SITES.includes(site)) throw new ProblemError(404, 'notFound', `No site ${site}`);
    return domains[site];
  };

  // The engine's { posts, hasNextPage } as a page of the API.
  const pageOf = (site, page, { posts, hasNextPage }) => ({
    posts: posts.map(({ url, title, posterUrl }) => ({ name: postName(site, url), title, posterUrl })),
    ...(hasNextPage && { nextPageToken: String(page + 1) }),
  });

  app.get('/v1/sites', {
    schema: {
      summary: 'ListSites',
      response: {
        200: {
          type: 'object',
          required: ['sites'],
          properties: { sites: { type: 'array', items: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } } } },
        },
      },
    },
  }, () => ({ sites: SITES.map((site) => ({ name: `sites/${site}` })) }));

  app.get('/v1/sites/:site/posts', {
    schema: {
      summary: 'ListPosts',
      params: siteParams,
      querystring: { type: 'object', properties: { pageToken } },
      response: { 200: postPage },
    },
  }, async (request) => {
    const { site } = request.params;
    const page = Number(request.query.pageToken ?? 1);
    return pageOf(site, page, await engine.scrapeListing(siteUrlOf(site), page));
  });

  app.get('/v1/sites/:site/search', {
    schema: {
      summary: 'SearchPosts',
      params: siteParams,
      querystring: {
        type: 'object',
        required: ['q'],
        properties: { q: { type: 'string', minLength: 1 }, pageToken },
      },
      response: { 200: postPage },
    },
  }, async (request) => {
    const { site } = request.params;
    const page = Number(request.query.pageToken ?? 1);
    return pageOf(site, page, await engine.searchPosts(siteUrlOf(site), request.query.q, page));
  });
}
